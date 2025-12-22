import { BasePath, ConfigurationOptions, VaultWalletAddress } from "@fireblocks/ts-sdk";

import { Logger } from "./utils/logger.js";

import {
  BalanceResponse,
  getTransactionsHistoryOpts,
  GroupedBalanceResponse,
} from "./types/iagon.js";
import { PoolConfig, SdkManager, SdkManagerMetrics } from "./index.js";
import { createRouter } from "./api/router.js";
import { Router } from "express";

export interface SDKConfig {
  /** Fireblocks API key */
  apiKey: string;
  /** Fireblocks secret key */
  secretKey: string;
  /** Fireblocks API base path (defaults to US) */
  basePath?: BasePath;
  /** Optional pool configuration for managing multiple vault connections */
  poolConfig?: PoolConfig;
  /** Optional custom logger instance */
  logger?: Logger;
}

export class CardanoTokensSDK {
  private sdkManager: SdkManager;
  private readonly logger: Logger;

  /**
   * Creates a new MainSDK instance
   *
   * @param config - SDK configuration
   */
  constructor(config: SDKConfig) {
    // Validate config
    if (!config.apiKey || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
      throw new Error("InvalidConfig: apiKey must be a non-empty string");
    }
    if (!config.secretKey || typeof config.secretKey !== "string" || !config.secretKey.trim()) {
      throw new Error("InvalidConfig: secretKey must be a non-empty string");
    }

    this.logger = config.logger ?? new Logger("MainSDK");

    const baseConfig: ConfigurationOptions = {
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      basePath: config.basePath || BasePath.US,
    };

    this.sdkManager = new SdkManager(baseConfig, config.poolConfig);

    this.logger.info("MainSDK initialized successfully");
  }

  public getBalanceByAddress = async (
    vaultAccountId: string,
    options: { index?: number; groupByPolicy?: boolean } = {}
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    return await this.sdkManager.getBalanceByAddress(vaultAccountId, options);
  };

  public getBalanceByCredential = async (
    vaultAccountId: string,
    options: { credential: string; groupByPolicy?: boolean }
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    return await this.sdkManager.getBalanceByCredential(vaultAccountId, options);
  };

  public getBalanceByStakeKey = async (
    vaultAccountId: string,
    options: { stakeKey: string; groupByPolicy?: boolean }
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    return await this.sdkManager.getBalanceByStakeKey(vaultAccountId, options);
  };

  public getTransactionsHistory = async (
    vaultAccountId: string,
    options: getTransactionsHistoryOpts = {}
  ): Promise<null> => {
    return await this.sdkManager.getTransactionsHistory(vaultAccountId, options);
  };

  /**
   * Retrieves the wallet addresses associated with a specific Fireblocks vault account.
   *
   * @param vaultAccountId - The unique identifier of the vault account to fetch addresses for.
   * @returns A promise that resolves to an array of VaultWalletAddress objects.
   * @throws Error if the retrieval fails.
   */
  public getVaultAccountAddresses = async (
    vaultAccountId: string
  ): Promise<VaultWalletAddress[]> => {
    return await this.sdkManager.getVaultAccountAddresses(vaultAccountId, "ADA");
  };

  /**
   * Get pool metrics
   *
   * Returns metrics about the SDK connection pool, including active connections,
   * pool utilization, and statistics.
   *
   * @returns Pool metrics object
   *
   * @example
   * ```typescript
   * const metrics = sdk.getPoolMetrics();
   * console.log('Active SDKs:', metrics.activeCount);
   * console.log('Pool size:', metrics.poolSize);
   * ```
   */
  public getPoolMetrics(): SdkManagerMetrics {
    return this.sdkManager.getMetrics();
  }

  /**
   * Create an Express router for REST API integration
   *
   * Returns a configured Express router that provides REST endpoints for all SDK operations.
   * Mount this router in your Express application to expose the Fireblocks operations via HTTP.
   *
   * @returns Express Router instance
   *
   * @example
   * ```typescript
   * import express from 'express';
   *
   * const app = express();
   * app.use(express.json());
   *
   * const sdk = new FireblocksSDK({
   *   apiKey: process.env.FIREBLOCKS_API_KEY!,
   *   secretKey: process.env.FIREBLOCKS_SECRET_KEY!
   * });
   *
   * // Mount the Fireblocks API routes
   * app.use('/api/fireblocks', sdk.createExpressRouter());
   *
   * app.listen(3000, () => {
   *   console.log('Server running on port 3000');
   * });
   *
   * // Available endpoints:
   * // GET  /api/fireblocks/vaults/:vaultAccountId/addresses/:assetId
   * // GET  /api/fireblocks/vaults/:vaultAccountId/addresses/:assetId/all
   * // GET  /api/fireblocks/vaults/:vaultAccountId/transactions
   * // POST /api/fireblocks/vaults/:vaultAccountId/transactions
   * ```
   */
  public createExpressRouter(): Router {
    return createRouter(this.sdkManager);
  }

  /**
   * Gracefully shutdown the SDK
   *
   * Closes all connections, cleans up resources, and prepares for application termination.
   * Should be called when the application is shutting down.
   *
   * @returns Promise that resolves when shutdown is complete
   *
   * @example
   * ```typescript
   * process.on('SIGTERM', async () => {
   *   console.log('Shutting down...');
   *   await sdk.shutdown();
   *   process.exit(0);
   * });
   * ```
   */
  public async shutdown(): Promise<void> {
    this.logger.info("Shutting down MainSDK...");
    await this.sdkManager.shutdown();
    this.logger.info("MainSDK shutdown complete");
  }
}
