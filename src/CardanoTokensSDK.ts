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
  getTransactionsHistoryOpts,
  GroupedBalanceResponse,
  transferOpts,
} from "./types/iagon.js";
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

    const addressData = await this.getVaultAccountAddress(vaultAccountId, "ADA", index);

    const address = addressData.address;

    if (!address) {
      throw new Error(
        `AddressNotFound: No address found for vault account ${vaultAccountId} at index ${index}`
      );
    }

    this.logger.info(`Getting balance for address ${address} (vault: ${vaultAccountId})`);

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
   * Fetches the sender address from Fireblocks vault account
   */
  private async fetchSenderAddress(vaultAccountId: string, index: number): Promise<string> {
    const addressData = await this.fireblocksService.getVaultAccountAddress(
      vaultAccountId,
      "ADA",
      index
    );

    if (!addressData.address) {
      throw new Error(
        `AddressNotFound: No address found for vault account ${vaultAccountId} at index ${index}`
      );
    }

    this.logger.info(`Sender address: ${addressData.address}`);
    return addressData.address;
  }

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

    const txOutputs = createTransactionOutputs(
      params.minRecipientLovelace,
      params.transactionFee,
      recipientAddrObj,
      senderAddrObj,
      params.tokenPolicyId,
      params.tokenName,
      params.requiredTokenAmount,
      params.selectedUtxos
    );

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
    vaultAccountId: string,
    txHashHex: string
  ): TransactionRequest {
    return {
      assetId: "ADA",
      operation: TransactionOperation.Raw,
      source: {
        type: TransferPeerPathType.VaultAccount,
        id: vaultAccountId,
      },
      note: "Transfer of Cardano tokens via CardanoTokensSDK",
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
  private async signTransaction(txBody: any, vaultAccountId: string) {
    const txHashHex = this.calculateTransactionHash(txBody);
    const transactionPayload = this.createFireblocksTransactionPayload(vaultAccountId, txHashHex);

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
      vaultAccountId,
      index = 0,
      recipientAddress,
      tokenPolicyId,
      tokenName,
      requiredTokenAmount,
      minRecipientLovelace = 1_000_000,
      minChangeLovelace = 1_000_000,
    } = options;

    try {
      this.logger.info(
        `Initiating transfer: ${requiredTokenAmount} ${tokenName} to ${recipientAddress}`
      );

      // Fetch sender address
      const senderAddress = await this.fetchSenderAddress(vaultAccountId, index);

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
      const signedTransaction = await this.signTransaction(txBody, vaultAccountId);

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
  public getVaultAccountAddresses = async (
    vaultAccountId: string,
    assetId: string = "ADA"
  ): Promise<VaultWalletAddress[]> => {
    return await this.fireblocksService.getVaultAccountAddresses(vaultAccountId, assetId);
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
    return await this.fireblocksService.getVaultAccountAddress(vaultAccountId, "ADA", index);
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
