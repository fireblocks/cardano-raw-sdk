import { PoolConfig, SdkManagerMetrics } from "../types/index.js";
import {
  ConfigurationOptions,
  VaultWalletAddress,
  SignedMessageSignature,
  TransactionRequest,
} from "@fireblocks/ts-sdk";
import { Logger } from "../utils/logger.js";
import { FireblocksService } from "../services/fireblocks.service.js";
import { IagonApiService } from "../services/iagon.api.service.js";
import {
  BalanceResponse,
  GroupedBalanceResponse,
  getTransactionsHistoryOpts,
  transferOpts,
  TransferResponse,
} from "../types/iagon.js";

/**
 * Pool item for FireblocksService instances
 */
interface ServicePoolItem {
  service: FireblocksService;
  lastUsed: Date;
  isInUse: boolean;
}

/**
 * Manages a pool of FireblocksService instances for efficient resource utilization.
 *
 * The SdkManager implements connection pooling for Fireblocks service instances, allowing
 * reuse across multiple requests. This reduces initialization overhead and manages resource
 * limits effectively. The manager handles:
 * - Service instance creation and lifecycle management
 * - Automatic cleanup of idle connections
 * - Pool size limits and LRU eviction policies
 * - Per-vault-account service instance tracking
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
 * // Use with automatic resource management
 * await manager.withService('vault-123', async (service) => {
 *   return await service.getVaultAccountAddress('vault-123', 'BTC', 0);
 * });
 * ```
 */
export class SdkManager {
  private servicePool: Map<string, ServicePoolItem> = new Map();
  private baseConfig: ConfigurationOptions;
  private poolConfig: PoolConfig;
  private cleanupInterval: NodeJS.Timeout;
  private readonly logger = new Logger("pool:sdk-manager");
  private readonly iagonApiService = new IagonApiService();

  /**
   * Creates an instance of SdkManager with connection pooling.
   *
   * @param baseConfig - Fireblocks SDK configuration used for all service instances
   * @param poolConfig - Optional pool configuration settings
   */
  constructor(baseConfig: ConfigurationOptions, poolConfig?: Partial<PoolConfig>) {
    this.baseConfig = baseConfig;

    this.poolConfig = {
      maxPoolSize: poolConfig?.maxPoolSize || 100,
      idleTimeoutMs: poolConfig?.idleTimeoutMs || 30 * 60 * 1000, // 30 minutes
      cleanupIntervalMs: poolConfig?.cleanupIntervalMs || 5 * 60 * 1000, // 5 minutes
      connectionTimeoutMs: poolConfig?.connectionTimeoutMs || 30 * 1000, // 30 seconds
      retryAttempts: poolConfig?.retryAttempts || 3,
    };

    this.cleanupInterval = setInterval(
      () => this.cleanupIdleServices(),
      this.poolConfig.cleanupIntervalMs
    );
  }

  /**
   * Retrieves or creates a FireblocksService instance.
   *
   * Implements pooling with LRU eviction for efficient resource management.
   *
   * @param vaultAccountId - The Fireblocks vault account ID (used as pool key)
   * @returns A Promise resolving to a FireblocksService instance
   * @private
   */
  private async getService(vaultAccountId: string): Promise<FireblocksService> {
    const key = vaultAccountId;
    const poolItem = this.servicePool.get(key);

    // Reuse existing idle service
    if (poolItem && !poolItem.isInUse) {
      this.logger.debug(`Reusing service for vault ${vaultAccountId}`);
      poolItem.lastUsed = new Date();
      poolItem.isInUse = true;
      return poolItem.service;
    }

    // Check pool capacity
    if (this.servicePool.size >= this.poolConfig.maxPoolSize && !poolItem) {
      const removed = await this.removeOldestIdleService();
      if (!removed) {
        throw new Error(
          `Service pool at maximum capacity (${this.poolConfig.maxPoolSize}) with no idle connections`
        );
      }
    }

    // Create new service if needed
    if (!poolItem) {
      const service = new FireblocksService(this.baseConfig);
      this.servicePool.set(key, {
        service,
        lastUsed: new Date(),
        isInUse: true,
      });
      this.logger.info(`Created new service for vault ${vaultAccountId}`);
      return service;
    }

    // Mark existing as in-use
    poolItem.lastUsed = new Date();
    poolItem.isInUse = true;
    return poolItem.service;
  }

  /**
   * Releases a service instance back to the pool.
   *
   * @param vaultAccountId - The vault account ID
   * @private
   */
  private releaseService(vaultAccountId: string): void {
    const poolItem = this.servicePool.get(vaultAccountId);
    if (poolItem) {
      poolItem.isInUse = false;
      poolItem.lastUsed = new Date();
    }
  }

  /**
   * Removes the oldest idle service from the pool (LRU eviction).
   *
   * @returns True if a service was removed, false otherwise
   * @private
   */
  private async removeOldestIdleService(): Promise<boolean> {
    let oldestKey: string | null = null;
    let oldestDate: Date = new Date();

    for (const [key, value] of this.servicePool.entries()) {
      if (!value.isInUse && value.lastUsed < oldestDate) {
        oldestDate = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.servicePool.delete(oldestKey);
      this.logger.info(`Evicted idle service for vault ${oldestKey}`);
      return true;
    }

    return false;
  }

  /**
   * Performs periodic cleanup of idle services.
   * @private
   */
  private async cleanupIdleServices(): Promise<void> {
    const now = new Date();
    const keysToRemove: string[] = [];

    for (const [key, value] of this.servicePool.entries()) {
      if (!value.isInUse) {
        const idleTime = now.getTime() - value.lastUsed.getTime();
        if (idleTime > this.poolConfig.idleTimeoutMs) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      this.servicePool.delete(key);
      this.logger.info(`Removed idle service for vault ${key}`);
    }
  }

  /**
   * Execute a function with automatic service lifecycle management.
   *
   * This method handles service acquisition and release automatically,
   * ensuring proper resource management even if the function throws an error.
   *
   * @param vaultAccountId - The vault account ID
   * @param fn - Function to execute with the service
   * @returns Promise resolving to the function result
   *
   * @example
   * ```typescript
   * const address = await manager.withService('vault-123', async (service) => {
   *   return await service.getVaultAccountAddress('vault-123', 'BTC', 0);
   * });
   * ```
   */
  public async withService<T>(
    vaultAccountId: string,
    fn: (service: FireblocksService) => Promise<T>
  ): Promise<T> {
    const service = await this.getService(vaultAccountId);
    try {
      return await fn(service);
    } finally {
      this.releaseService(vaultAccountId);
    }
  }

  /**
   * @deprecated Use withService instead. For backward compatibility with deprecated ApiService.
   * Will be removed in v2.0.
   */
  public async withSdk<T>(
    vaultAccountId: string,
    fn: (service: FireblocksService) => Promise<T>
  ): Promise<T> {
    return await this.withService(vaultAccountId, fn);
  }

  /**
   * Convenience method: Get vault account address
   */
  public async getVaultAccountAddress(
    vaultAccountId: string,
    assetId: string,
    index: number = 0
  ): Promise<VaultWalletAddress> {
    return await this.withService(vaultAccountId, async (service) => {
      return await service.getVaultAccountAddress(vaultAccountId, assetId, index);
    });
  }

  /**
   * Convenience method: Get all vault account addresses
   */
  public async getVaultAccountAddresses(
    vaultAccountId: string,
    assetId: string
  ): Promise<VaultWalletAddress[]> {
    return await this.withService(vaultAccountId, async (service) => {
      return await service.getVaultAccountAddresses(vaultAccountId, assetId);
    });
  }

  /**
   * Convenience method: Submit transaction
   */
  public async submitTransaction(
    vaultAccountId: string,
    transactionRequest: TransactionRequest,
    waitForCompletion: boolean = true
  ): Promise<{
    signature: SignedMessageSignature;
    content?: string;
    publicKey?: string;
    algorithm?: string;
  } | null> {
    return await this.withService(vaultAccountId, async (service) => {
      if (waitForCompletion) {
        return await service.broadcastTransaction(transactionRequest);
      } else {
        throw new Error(
          "Non-blocking transaction submission not yet implemented. Set waitForCompletion to true."
        );
      }
    });
  }

  /**
   * Get balance by address for a vault account
   */
  public async getBalanceByAddress(
    vaultAccountId: string,
    options: { index?: number; groupByPolicy?: boolean } = {}
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> {
    const { index = 0, groupByPolicy = false } = options;

    return await this.withService(vaultAccountId, async (service) => {
      const addressData = await service.getVaultAccountAddress(vaultAccountId, "ADA", index);

      if (!addressData.address) {
        throw new Error(`No address found for vault ${vaultAccountId} at index ${index}`);
      }

      const address = addressData.address;

      this.logger.info(
        `Getting balance for vault ${vaultAccountId} at index ${index} (address: ${address})`
      );

      return await this.iagonApiService.getBalanceByAddress({
        address,
        groupByPolicy,
      });
    });
  }

  /**
   * Get balance by credential for a vault account
   */
  public async getBalanceByCredential(
    vaultAccountId: string,
    options: { credential: string; groupByPolicy?: boolean }
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> {
    const { credential, groupByPolicy = false } = options;

    this.logger.info(`Getting balance for credential ${credential} (vault: ${vaultAccountId})`);

    return await this.iagonApiService.getBalanceByCredential({
      credential,
      groupByPolicy,
    });
  }

  /**
   * Get balance by stake key for a vault account
   */
  public async getBalanceByStakeKey(
    vaultAccountId: string,
    options: { stakeKey: string; groupByPolicy?: boolean }
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> {
    const { stakeKey, groupByPolicy = false } = options;

    this.logger.info(`Getting balance for stake key ${stakeKey} (vault: ${vaultAccountId})`);

    return await this.iagonApiService.getBalanceByStakeKey({
      stakeKey,
      groupByPolicy,
    });
  }

  /**
   * Get transaction history for a vault account address
   */
  public async getTransactionsHistory(
    vaultAccountId: string,
    options: getTransactionsHistoryOpts = {}
  ): Promise<null> {
    const { index = 0 } = options;

    return await this.withService(vaultAccountId, async (service) => {
      const addressData = await service.getVaultAccountAddress(vaultAccountId, "ADA", index);
      const address = addressData.address;

      this.logger.info(
        `Getting transaction history for vault ${vaultAccountId} at index ${index} (address: ${address})`
      );

      return await this.iagonApiService.getTransactionsHistory({});
    });
  }

  /**
   * Execute a transfer
   */
  public async transfer(options: transferOpts): Promise<TransferResponse> {
    const { vaultAccountId, index = 0 } = options;

    return await this.withService(vaultAccountId, async (service) => {
      const addressData = await service.getVaultAccountAddress(vaultAccountId, "ADA", index);
      const senderAddress = addressData.address;

      this.logger.info(
        `Initiating transfer from vault ${vaultAccountId} at index ${index} (address: ${senderAddress})`
      );

      this.logger.warn("Transfer method not yet fully implemented");
      throw new Error("Transfer method not yet fully implemented");
    });
  }

  /**
   * Get public key for a vault account address
   */
  public async getPublicKey(
    vaultAccountId: string,
    assetId: string,
    change: number = 0,
    addressIndex: number = 0
  ): Promise<string> {
    return await this.withService(vaultAccountId, async (service) => {
      return await service.getAssetPublicKey(vaultAccountId, assetId, change, addressIndex);
    });
  }

  /**
   * Get pool metrics
   */
  public getMetrics(): SdkManagerMetrics {
    const metrics: SdkManagerMetrics = {
      totalInstances: this.servicePool.size,
      activeInstances: 0,
      idleInstances: 0,
      instancesByVaultAccount: {},
    };

    for (const [key, value] of this.servicePool.entries()) {
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
    this.servicePool.clear();
    this.logger.info("SDK manager shutdown complete");
  }
}
