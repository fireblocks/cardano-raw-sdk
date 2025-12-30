import {
  BasePath,
  ConfigurationOptions,
  VaultWalletAddress,
  SignedMessageSignature,
  TransactionRequest,
  TransactionOperation,
  TransferPeerPathType,
} from "@fireblocks/ts-sdk";

import { Logger } from "./utils/logger.js";

import {
  BalanceResponse,
  GroupedBalanceResponse,
  DetailedTxHistoryResponse,
  transferOpts,
  TransactionHistoryResponse,
  TransactionDetailsResponse,
  SupportedAssets,
  Networks,
} from "./types/index.js";
import { FireblocksService } from "./services/fireblocks.service.js";
import { IagonApiService } from "./services/iagon.api.service.js";
import { tokenTransactionFee } from "./constants.js";
import {
  buildTransaction,
  calculateTtl,
  createTransactionInputs,
  createTransactionOutputs,
  fetchAndSelectUtxos,
  submitTransaction,
} from "./utils/cardano.utils.js";
import {
  Address,
  Ed25519Signature,
  PublicKey,
  Transaction,
  TransactionWitnessSet,
  Vkey,
  Vkeywitness,
  Vkeywitnesses,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { blake2b } from "blakejs";

export interface SDKConfig {
  vaultAccountId: string;
  fireblocksService: FireblocksService;
  iagonApiService: IagonApiService;
  network: Networks;
  logger: Logger;
}

export class FireblocksIagonSDK {
  private readonly fireblocksService: FireblocksService;
  private readonly iagonApiService: IagonApiService;
  private network: Networks;
  private vaultAccountId: string;
  private addresses: Map<number, string> = new Map();
  private publicKeys: Map<string, string> = new Map();
  private readonly logger: Logger;

  /**
   * Creates a new FireblocksIagonSDK instance
   *
   * @param config - SDK configuration
   */
  constructor(config: SDKConfig) {
    this.logger = config.logger;

    this.fireblocksService = config.fireblocksService;
    this.iagonApiService = config.iagonApiService;
    this.network = config.network;

    this.vaultAccountId = config.vaultAccountId;

    this.logger.info("FireblocksIagonSDK initialized successfully");
  }

  public static createInstance = async (params: {
    fireblocksConfig: ConfigurationOptions;
    vaultAccountId: string;
    network: Networks;
  }): Promise<FireblocksIagonSDK> => {
    try {
      const logger = new Logger(`app:fireblocks-iagon-sdk`);

      const { fireblocksConfig, vaultAccountId, network } = params;

      if (network === Networks.PREVIEW) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const fireblocksService = new FireblocksService(fireblocksConfig);
      const iagonApiService = new IagonApiService(network);
      const assetId = network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
      const wallet = await fireblocksService.getVaultAccountAddress(vaultAccountId, assetId);

      const address = wallet.address;

      if (!address) {
        throw new Error(
          `Invalid address found for vault account ${vaultAccountId} and asset ${assetId}`
        );
      }

      const sdkInstance = new FireblocksIagonSDK({
        fireblocksService,
        iagonApiService,
        network,
        vaultAccountId,
        logger,
      });

      return sdkInstance;
    } catch (error: any) {
      throw new Error(
        `Error creating FireblocksIagonSDK: ${error instanceof Error ? error.message : error}`
      );
    }
  };

  /**
   * Get balance by address for a vault account
   */
  public getBalanceByAddress = async (
    options: { index?: number; groupByPolicy?: boolean } = {}
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { index = 0, groupByPolicy = false } = options;

    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;

    // Use cached address fetching
    const address = await this.getAddressByIndex(assetId, index);

    this.logger.info(`Getting balance for address ${address} (vault: ${this.vaultAccountId})`);
    return await this.iagonApiService.getBalanceByAddress({
      address,
      groupByPolicy,
    });
  };

  /**
   * Get balance by credential for a vault account
   */
  public getBalanceByCredential = async (options: {
    credential: string;
    groupByPolicy?: boolean;
  }): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { credential, groupByPolicy = false } = options;

    this.logger.info(`Getting balance for credential ${credential}`);
    return await this.iagonApiService.getBalanceByCredential({
      credential,
      groupByPolicy,
    });
  };

  /**
   * Get balance by stake key for a vault account
   */
  public getBalanceByStakeKey = async (options: {
    stakeKey: string;
    groupByPolicy?: boolean;
  }): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { stakeKey, groupByPolicy = false } = options;

    this.logger.info(`Getting balance for stake key ${stakeKey}`);

    return await this.iagonApiService.getBalanceByStakeKey({
      stakeKey,
      groupByPolicy,
    });
  };

  /**
   * Helper method to fetch and validate address for a vault account
   */
  private async getAddressByIndex(assetId: SupportedAssets, index: number): Promise<string> {
    const cacheKey = index;
    const cachedAddress = this.addresses.get(cacheKey);

    if (cachedAddress) {
      this.logger.debug(`Using cached address for index ${index}`);
      return cachedAddress;
    }

    const addressData = await this.fireblocksService.getVaultAccountAddress(
      this.vaultAccountId,
      assetId,
      index
    );
    const address = addressData.address;

    if (!address) {
      throw new Error(
        `AddressNotFound: No address found for vault account ${this.vaultAccountId} at index ${index}`
      );
    }

    // Add to cache
    this.addresses.set(cacheKey, address);
    this.logger.debug(`Cached address for index ${index}`);

    return address;
  }

  /**
   * Get transaction details by hash
   */
  public getTransactionDetails = async (hash: string): Promise<TransactionDetailsResponse> => {
    return await this.iagonApiService.getTransactionDetails(hash);
  };

  /**
   * Get transaction history for a vault account address
   */
  public getTransactionHistory = async (
    index: number = 0,
    options: {
      limit?: number;
      offset?: number;
      fromSlot?: number;
    } = {}
  ): Promise<TransactionHistoryResponse> => {
    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
    const address = await this.getAddressByIndex(assetId, index);
    this.logger.info(
      `Getting transaction history for vault ${this.vaultAccountId}, asset ${assetId}, at index ${index} (address: ${address})`
    );

    return await this.iagonApiService.getTransactionHistory({ address, ...options });
  };

  /**
   * Get detailed transaction history for a vault account address
   */
  public getDetailedTxHistory = async (
    index: number = 0,
    options: {
      limit?: number;
      offset?: number;
      fromSlot?: number;
    } = {}
  ): Promise<DetailedTxHistoryResponse> => {
    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
    const address = await this.getAddressByIndex(assetId, index);

    this.logger.info(
      `Getting detailed transaction history for vault ${this.vaultAccountId}, asset ${assetId}, at index ${index} (address: ${address})`
    );

    return await this.iagonApiService.getDetailedTxHistory({ address, ...options });
  };

  /**
   * Selects and validates UTXOs for the transaction
   */
  private async selectAndValidateUtxos(params: {
    address: string;
    tokenPolicyId: string;
    tokenName: string;
    requiredTokenAmount: number;
    transactionFee: number;
    minRecipientLovelace: number;
    minChangeLovelace: number;
  }) {
    const utxoResult = await fetchAndSelectUtxos({
      iagonApiService: this.iagonApiService,
      ...params,
    });

    if (!utxoResult) {
      throw new Error("UtxoSelectionFailed: No suitable UTXOs found for this transaction");
    }

    const { selectedUtxos, accumulatedAda, accumulatedTokenAmount } = utxoResult;
    const adaTarget = params.minRecipientLovelace + params.transactionFee;

    if (accumulatedTokenAmount < params.requiredTokenAmount || accumulatedAda < adaTarget) {
      const error = new Error("InsufficientBalance: Insufficient balance for token or ADA");
      (error as any).code = "INSUFFICIENT_BALANCE";
      (error as any).details = {
        requiredTokenAmount: params.requiredTokenAmount,
        accumulatedTokenAmount,
        requiredAda: adaTarget,
        accumulatedAda,
      };
      throw error;
    }

    return { selectedUtxos, accumulatedAda, accumulatedTokenAmount };
  }

  /**
   * Builds the Cardano transaction body
   */
  private async buildTransactionBody(params: {
    selectedUtxos: any[];
    recipientAddress: string;
    senderAddress: string;
    tokenPolicyId: string;
    tokenName: string;
    requiredTokenAmount: number;
    minRecipientLovelace: number;
    transactionFee: number;
  }) {
    const txInputs = createTransactionInputs(params.selectedUtxos);
    const recipientAddrObj = Address.from_bech32(params.recipientAddress);
    const senderAddrObj = Address.from_bech32(params.senderAddress);

    const txOutputs = createTransactionOutputs({
      requiredLovelace: params.minRecipientLovelace,
      fee: params.transactionFee,
      recipientAddress: recipientAddrObj,
      senderAddress: senderAddrObj,
      tokenPolicyId: params.tokenPolicyId,
      tokenName: params.tokenName,
      transferAmount: params.requiredTokenAmount,
      selectedUtxos: params.selectedUtxos,
    });

    const ttl = await calculateTtl(2600);
    return buildTransaction({
      txInputs,
      txOutputs,
      fee: params.transactionFee,
      ttl,
    });
  }

  /**
   * Calculates the transaction hash from transaction body
   */
  private calculateTransactionHash(txBody: any): string {
    const txBodyBytes = txBody.to_bytes();
    const hashBytes = blake2b(txBodyBytes, undefined, 32);
    return Buffer.from(hashBytes).toString("hex");
  }

  /**
   * Creates Fireblocks transaction payload for signing
   */
  private createFireblocksTransactionPayload(
    assetId: SupportedAssets,
    txHashHex: string
  ): TransactionRequest {
    return {
      assetId,
      operation: TransactionOperation.Raw,
      source: {
        type: TransferPeerPathType.VaultAccount,
        id: this.vaultAccountId,
      },
      note: "Transfer of Cardano tokens via FireblocksIagonSDK",
      extraParameters: {
        rawMessageData: {
          messages: [
            {
              content: txHashHex,
            },
          ],
        },
      },
    };
  }

  /**
   * Signs the transaction using Fireblocks and creates witness set
   */
  private async signTransaction(
    txBody: any,
    assetId: SupportedAssets = SupportedAssets.ADA
  ): Promise<Transaction> {
    const txHashHex = this.calculateTransactionHash(txBody);
    const transactionPayload = this.createFireblocksTransactionPayload(assetId, txHashHex);

    const signatureResponse = await this.fireblocksService.broadcastTransaction(transactionPayload);

    if (!signatureResponse?.publicKey || !signatureResponse?.signature?.fullSig) {
      throw new Error("SigningFailed: Invalid signature response from Fireblocks");
    }

    const publicKeyBytes = Uint8Array.from(Buffer.from(signatureResponse.publicKey, "hex"));
    const signatureBytes = Uint8Array.from(Buffer.from(signatureResponse.signature.fullSig, "hex"));

    const cardanoPubKey = Vkey.new(PublicKey.from_bytes(publicKeyBytes));
    const cardanoSig = Ed25519Signature.from_bytes(signatureBytes);

    const witness = Vkeywitness.new(cardanoPubKey, cardanoSig);
    const witnesses = Vkeywitnesses.new();
    witnesses.add(witness);

    const witnessSet = TransactionWitnessSet.new();
    witnessSet.set_vkeys(witnesses);

    return Transaction.new(txBody, witnessSet);
  }

  /**
   * Execute a transfer of Cardano tokens
   *
   * @param options - Transfer configuration options
   * @returns Transaction result with hash, sender address, and token name
   * @throws Error if any step of the transfer process fails
   */
  public transfer = async (
    options: transferOpts
  ): Promise<{
    txHash: string;
    senderAddress: string;
    tokenName: string;
  }> => {
    const {
      index = 0,
      recipientAddress,
      tokenPolicyId,
      tokenName,
      requiredTokenAmount,
      minRecipientLovelace = 1_200_000,
      minChangeLovelace = 1_200_000,
    } = options;

    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;

    try {
      this.logger.info(
        `Initiating transfer: ${requiredTokenAmount} ${tokenName} to ${recipientAddress}`
      );

      // Fetch sender address
      const senderAddress = await this.getAddressByIndex(assetId, index);

      // Select and validate UTXOs
      const { selectedUtxos } = await this.selectAndValidateUtxos({
        address: senderAddress,
        tokenPolicyId,
        tokenName,
        requiredTokenAmount,
        transactionFee: tokenTransactionFee,
        minRecipientLovelace,
        minChangeLovelace,
      });

      // Build transaction body
      const txBody = await this.buildTransactionBody({
        selectedUtxos,
        recipientAddress,
        senderAddress,
        tokenPolicyId,
        tokenName,
        requiredTokenAmount,
        minRecipientLovelace,
        transactionFee: tokenTransactionFee,
      });

      // Sign transaction with Fireblocks
      const signedTransaction = await this.signTransaction(txBody);

      // Submit transaction to blockchain
      const txHash = await submitTransaction(this.iagonApiService, signedTransaction);

      this.logger.info(`Transfer successful: ${txHash}`);

      return {
        txHash,
        senderAddress,
        tokenName,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transfer failed: ${errorMessage}`);

      // Re-throw the original error to preserve error codes and details
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(`TransferFailed: ${errorMessage}`);
    }
  };

  /**
   * Retrieves the wallet addresses associated with a specific Fireblocks vault account.
   *
   * @param vaultAccountId - The unique identifier of the vault account to fetch addresses for.
   * @returns A promise that resolves to an array of VaultWalletAddress objects.
   * @throws Error if the retrieval fails.
   */
  public getVaultAccountAddresses = async (): Promise<VaultWalletAddress[]> => {
    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
    return await this.fireblocksService.getVaultAccountAddresses(this.vaultAccountId, assetId);
  };

  /**
   * Get public key for a vault account address with caching
   */
  public getPublicKey = async (
    change: number = 0,
    addressIndex: number = 0
  ): Promise<string> => {
    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
    // Create cache key from all parameters
    const cacheKey = `${assetId}-${change}-${addressIndex}`;
    const cachedPublicKey = this.publicKeys.get(cacheKey);

    if (cachedPublicKey) {
      this.logger.debug(`Using cached public key for ${cacheKey}`);
      return cachedPublicKey;
    }

    // Fetch from Fireblocks if not cached
    const publicKey = await this.fireblocksService.getAssetPublicKey(
      this.vaultAccountId,
      assetId,
      change,
      addressIndex
    );

    // Cache the public key
    this.publicKeys.set(cacheKey, publicKey);
    this.logger.debug(`Cached public key for ${cacheKey}`);

    return publicKey;
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
   * Clear all cached data (addresses and public keys)
   */
  public clearCache(): void {
    this.addresses.clear();
    this.publicKeys.clear();
    this.logger.info("Cache cleared");
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { addressCount: number; publicKeyCount: number } {
    return {
      addressCount: this.addresses.size,
      publicKeyCount: this.publicKeys.size,
    };
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
    this.logger.info("Shutting down FireblocksIagonSDK...");
    this.clearCache();
    this.logger.info("FireblocksIagonSDK shutdown complete");
  }
}
