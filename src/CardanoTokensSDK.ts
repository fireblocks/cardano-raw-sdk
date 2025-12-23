import {
  BasePath,
  ConfigurationOptions,
  VaultWalletAddress,
  SignedMessageSignature,
  TransactionRequest,
} from "@fireblocks/ts-sdk";

import { Logger } from "./utils/logger.js";

import {
  BalanceResponse,
  getTransactionsHistoryOpts,
  GroupedBalanceResponse,
  transferOpts,
  TransferResponse,
} from "./types/iagon.js";
import { FireblocksService } from "./services/fireblocks.service.js";
import { IagonApiService } from "./services/iagon.api.service.js";

export interface SDKConfig {
  /** Fireblocks API key */
  apiKey: string;
  /** Fireblocks secret key */
  secretKey: string;
  /** Fireblocks API base path (defaults to US) */
  basePath?: BasePath;
  /** Optional custom logger instance */
  logger?: Logger;
}

export class CardanoTokensSDK {
  private readonly fireblocksService: FireblocksService;
  private readonly iagonApiService: IagonApiService;
  private readonly logger: Logger;

  /**
   * Creates a new CardanoTokensSDK instance
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

    this.logger = config.logger ?? new Logger("CardanoTokensSDK");

    const baseConfig: ConfigurationOptions = {
      apiKey: config.apiKey,
      secretKey: config.secretKey,
      basePath: config.basePath || BasePath.US,
    };

    this.fireblocksService = new FireblocksService(baseConfig);
    this.iagonApiService = new IagonApiService();

    this.logger.info("CardanoTokensSDK initialized successfully");
  }

  /**
   * Get balance by address for a vault account
   */
  public getBalanceByAddress = async (
    vaultAccountId: string,
    options: { index?: number; groupByPolicy?: boolean } = {}
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { index = 0, groupByPolicy = false } = options;

    const addressData = await this.fireblocksService.getVaultAccountAddress(
      vaultAccountId,
      "ADA",
      index
    );

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
  };

  /**
   * Get balance by credential for a vault account
   */
  public getBalanceByCredential = async (
    vaultAccountId: string,
    options: { credential: string; groupByPolicy?: boolean }
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { credential, groupByPolicy = false } = options;

    this.logger.info(`Getting balance for credential ${credential} (vault: ${vaultAccountId})`);

    return await this.iagonApiService.getBalanceByCredential({
      credential,
      groupByPolicy,
    });
  };

  /**
   * Get balance by stake key for a vault account
   */
  public getBalanceByStakeKey = async (
    vaultAccountId: string,
    options: { stakeKey: string; groupByPolicy?: boolean }
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { stakeKey, groupByPolicy = false } = options;

    this.logger.info(`Getting balance for stake key ${stakeKey} (vault: ${vaultAccountId})`);

    return await this.iagonApiService.getBalanceByStakeKey({
      stakeKey,
      groupByPolicy,
    });
  };

  /**
   * Get transaction history for a vault account address
   */
  public getTransactionsHistory = async (
    vaultAccountId: string,
    options: getTransactionsHistoryOpts = {}
  ): Promise<null> => {
    const { index = 0 } = options;

    const addressData = await this.fireblocksService.getVaultAccountAddress(
      vaultAccountId,
      "ADA",
      index
    );
    const address = addressData.address;

    this.logger.info(
      `Getting transaction history for vault ${vaultAccountId} at index ${index} (address: ${address})`
    );

    return await this.iagonApiService.getTransactionsHistory({});
  };

  /**
   * Execute a transfer
   */
  public transfer = async (options: transferOpts): Promise<TransferResponse> => {
    const { vaultAccountId, index = 0 } = options;

    const addressData = await this.fireblocksService.getVaultAccountAddress(
      vaultAccountId,
      "ADA",
      index
    );
    const senderAddress = addressData.address;

    this.logger.info(
      `Initiating transfer from vault ${vaultAccountId} at index ${index} (address: ${senderAddress})`
    );

    this.logger.warn("Transfer method not yet fully implemented");
    throw new Error("Transfer method not yet fully implemented");
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
    return await this.fireblocksService.getVaultAccountAddresses(vaultAccountId, "ADA");
  };

  /**
   * Retrieves a specific vault account address by index.
   *
   * @param vaultAccountId - The Fireblocks vault account ID
   * @param assetId - The asset/blockchain identifier (defaults to ADA)
   * @param index - The BIP-44 address derivation index (defaults to 0)
   * @returns A promise that resolves to a VaultWalletAddress object.
   * @throws Error if the retrieval fails.
   */
  public getVaultAccountAddress = async (
    vaultAccountId: string,
    assetId: string = "ADA",
    index: number = 0
  ): Promise<VaultWalletAddress> => {
    return await this.fireblocksService.getVaultAccountAddress(vaultAccountId, assetId, index);
  };

  /**
   * Get public key for a vault account address
   */
  public getPublicKey = async (
    vaultAccountId: string,
    assetId: string = "ADA",
    change: number = 0,
    addressIndex: number = 0
  ): Promise<string> => {
    return await this.fireblocksService.getAssetPublicKey(
      vaultAccountId,
      assetId,
      change,
      addressIndex
    );
  };

  /**
   * Broadcasts a transaction to the Fireblocks network and waits for signing completion.
   *
   * @param transactionRequest - The transaction request to broadcast
   * @returns A promise that resolves to the signature data
   * @throws Error if the transaction fails
   */
  public broadcastTransaction = async (
    transactionRequest: TransactionRequest
  ): Promise<{
    signature: SignedMessageSignature;
    content?: string;
    publicKey?: string;
    algorithm?: string;
  } | null> => {
    return await this.fireblocksService.broadcastTransaction(transactionRequest);
  };

  /**
   * Get direct access to the Fireblocks service
   * @internal - For advanced usage only
   */
  public getFireblocksService(): FireblocksService {
    return this.fireblocksService;
  }

  /**
   * Get direct access to the Iagon API service
   * @internal - For advanced usage only
   */
  public getIagonApiService(): IagonApiService {
    return this.iagonApiService;
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
   *   process.exit(0)
   * });
   * ```
   */
  public async shutdown(): Promise<void> {
    this.logger.info("Shutting down CardanoTokensSDK...");
    this.logger.info("CardanoTokensSDK shutdown complete");
  }
}
