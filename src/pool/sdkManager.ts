import { PoolConfig, SdkManagerMetrics } from "../types/index.js";
import { ConfigurationOptions } from "@fireblocks/ts-sdk";
import { Logger } from "../utils/logger.js";

// Forward declaration to avoid circular dependency
import type { CardanoTokensSDK } from "../CardanoTokensSDK.js";

/**
 * Pool item for CardanoTokensSDK instances
 */
interface SdkPoolItem {
  sdk: CardanoTokensSDK;
  lastUsed: Date;
  isInUse: boolean;
}

/**
 * Manages a pool of CardanoTokensSDK instances for efficient resource utilization.
 *
 * The SdkManager implements connection pooling for CardanoTokensSDK instances, allowing
 * reuse across multiple API requests. This reduces initialization overhead and manages resource
 * limits effectively. The manager handles:
 * - CardanoTokensSDK instance creation and lifecycle management per vault account
 * - Automatic cleanup of idle connections
 * - Pool size limits and LRU eviction policies
 * - Per-vault-account SDK instance tracking
 *
 * @class SdkManager
 * @example
 * ```typescript
 * const config: ConfigurationOptions = {
 *   apiKey: 'your-api-key',
 *   secretKey: 'your-secret-key',
 *   basePath: BasePath.US
 * };
 *
 * const manager = new SdkManager(config, {
 *   maxPoolSize: 50,
 *   idleTimeoutMs: 20 * 60 * 1000
 * });
 *
 * // Get SDK for a vault account
 * const sdk = manager.getSdk('vault-123');
 * const address = await sdk.getVaultAccountAddress('vault-123', 'BTC', 0);
 * ```
 */
export class SdkManager {
  private sdkPool: Map<string, SdkPoolItem> = new Map();
  private baseConfig: ConfigurationOptions;
  private poolConfig: PoolConfig;
  private cleanupInterval: NodeJS.Timeout;
  private readonly logger = new Logger("pool:sdk-manager");
  private sdkFactory: (config: ConfigurationOptions) => CardanoTokensSDK;

  /**
   * Creates an instance of SdkManager with connection pooling.
   *
   * @param baseConfig - Fireblocks SDK configuration used for all CardanoTokensSDK instances
   * @param poolConfig - Optional pool configuration settings
   * @param sdkFactory - Factory function to create CardanoTokensSDK instances (used to avoid circular dependency)
   */
  constructor(
    baseConfig: ConfigurationOptions,
    poolConfig?: Partial<PoolConfig>,
    sdkFactory?: (config: ConfigurationOptions) => CardanoTokensSDK
  ) {
    this.baseConfig = baseConfig;

    this.poolConfig = {
      maxPoolSize: poolConfig?.maxPoolSize || 100,
      idleTimeoutMs: poolConfig?.idleTimeoutMs || 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: poolConfig?.cleanupIntervalMs || 5 * 60 * 1000, // 5 minutes
      connectionTimeoutMs: poolConfig?.connectionTimeoutMs || 30 * 1000, // 30 seconds
      retryAttempts: poolConfig?.retryAttempts || 3,
    };

    // Store the factory function, will be set by CardanoTokensSDK
    this.sdkFactory =
      sdkFactory ||
      (() => {
        throw new Error("SDK factory not initialized. This should be set by CardanoTokensSDK.");
      });

    this.cleanupInterval = setInterval(
      () => this.cleanupIdleSdks(),
      this.poolConfig.cleanupIntervalMs
    );
  }

  /**
   * Sets the SDK factory function (called by CardanoTokensSDK to avoid circular dependency)
   * @param factory - Factory function to create CardanoTokensSDK instances
   */
  public setSdkFactory(factory: (config: ConfigurationOptions) => CardanoTokensSDK): void {
    this.sdkFactory = factory;
  }

  /**
   * Gets or creates a CardanoTokensSDK instance for a specific vault account.
   *
   * Implements pooling with LRU eviction for efficient resource management.
   * Each vault account gets its own CardanoTokensSDK instance that can be reused across requests.
   *
   * @param vaultAccountId - The Fireblocks vault account ID (used as pool key)
   * @returns A CardanoTokensSDK instance
   *
   * @example
   * ```typescript
   * const sdk = manager.getSdk('vault-123');
   * const address = await sdk.getVaultAccountAddress('vault-123', 'BTC', 0);
   * ```
   */
  public getSdk(vaultAccountId: string): CardanoTokensSDK {
    const key = vaultAccountId;
    const poolItem = this.sdkPool.get(key);

    // Reuse existing SDK
    if (poolItem) {
      this.logger.debug(`Reusing SDK for vault ${vaultAccountId}`);
      poolItem.lastUsed = new Date();
      poolItem.isInUse = true;
      return poolItem.sdk;
    }

    // Check pool capacity
    if (this.sdkPool.size >= this.poolConfig.maxPoolSize) {
      const removed = this.removeOldestIdleSdk();
      if (!removed) {
        throw new Error(
          `SDK pool at maximum capacity (${this.poolConfig.maxPoolSize}) with no idle connections`
        );
      }
    }

    // Create new SDK
    this.logger.info(`Creating new SDK for vault ${vaultAccountId}`);
    const sdk = this.sdkFactory(this.baseConfig);

    this.sdkPool.set(key, {
      sdk,
      lastUsed: new Date(),
      isInUse: true,
    });

    return sdk;
  }

  /**
   * Releases an SDK instance back to the pool.
   *
   * @param vaultAccountId - The vault account ID
   */
  public releaseSdk(vaultAccountId: string): void {
    const poolItem = this.sdkPool.get(vaultAccountId);
    if (poolItem) {
      poolItem.isInUse = false;
      poolItem.lastUsed = new Date();
    }
  }

  /**
   * Removes the oldest idle SDK from the pool (LRU eviction).
   *
   * @returns True if an SDK was removed, false otherwise
   * @private
   */
  private removeOldestIdleSdk(): boolean {
    let oldestKey: string | null = null;
    let oldestDate: Date = new Date();

    for (const [key, value] of this.sdkPool.entries()) {
      if (!value.isInUse && value.lastUsed < oldestDate) {
        oldestDate = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.sdkPool.delete(oldestKey);
      this.logger.info(`Evicted idle SDK for vault ${oldestKey}`);
      return true;
    }

    return false;
  }

  /**
   * Performs periodic cleanup of idle SDKs.
   * @private
   */
  private cleanupIdleSdks(): void {
    const now = new Date();
    const keysToRemove: string[] = [];

    for (const [key, value] of this.sdkPool.entries()) {
      if (!value.isInUse) {
        const idleTime = now.getTime() - value.lastUsed.getTime();
        if (idleTime > this.poolConfig.idleTimeoutMs) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      const poolItem = this.sdkPool.get(key);
      if (poolItem) {
        // Shutdown the SDK before removing
        poolItem.sdk.shutdown().catch((err) => {
          this.logger.error(`Error shutting down SDK for vault ${key}:`, err);
        });
      }
      this.sdkPool.delete(key);
      this.logger.info(`Removed idle SDK for vault ${key}`);
    }
  }

  /**
   * Get pool metrics
   */
  public getMetrics(): SdkManagerMetrics {
    const metrics: SdkManagerMetrics = {
      totalInstances: this.sdkPool.size,
      activeInstances: 0,
      idleInstances: 0,
      instancesByVaultAccount: {},
    };

    for (const [key, value] of this.sdkPool.entries()) {
      if (value.isInUse) {
        metrics.activeInstances++;
      } else {
        metrics.idleInstances++;
      }
      metrics.instancesByVaultAccount[key] = value.isInUse;
    }

    return metrics;
  }

  /**
   * Graceful shutdown of the pool
   */
  public async shutdown(): Promise<void> {
    clearInterval(this.cleanupInterval);

    // Shutdown all SDKs in the pool
    const shutdownPromises = Array.from(this.sdkPool.values()).map((item) =>
      item.sdk.shutdown().catch((err) => {
        this.logger.error("Error shutting down SDK:", err);
      })
    );

    await Promise.all(shutdownPromises);
    this.sdkPool.clear();
    this.logger.info("SDK manager shutdown complete");
  }
}
