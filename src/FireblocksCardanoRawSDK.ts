import {
  ConfigurationOptions,
  VaultWalletAddress,
  SignedMessageSignature,
  TransactionRequest,
  TransactionOperation,
  TransferPeerPathType,
  SignedMessageAlgorithmEnum,
} from "@fireblocks/ts-sdk";

import {
  Logger,
  buildTransaction,
  calculateTtl,
  createTransactionInputs,
  createTransactionOutputs,
  fetchAndSelectUtxos,
  submitTransaction,
  decodeAssetName,
} from "./utils/index.js";

import {
  BalanceResponse,
  GroupedBalanceResponse,
  DetailedTxHistoryResponse,
  transferOpts,
  TransactionHistoryResponse,
  TransactionDetailsResponse,
  WebhookPayloadData,
  EnrichedWebhookPayloadData,
  SupportedAssets,
  Networks,
  UtxoIagonResponse,
  GroupByOptions,
  VaultBalanceResponse,
  VaultBalanceTokenResponse,
  VaultBalanceByToken,
  VaultBalanceAddressResponse,
  VaultBalanceByAddress,
  VaultBalancePolicyResponse,
  VaultBalanceByPolicy,
  IagonApiError,
  RegisterStakingOptions,
  StakingTransactionResult,
  DelegationOptions,
  DeregisterStakingOptions,
  WithdrawRewardsOptions,
  DRepDelegationOptions,
  RewardsData,
  WebhookEventTypes,
  TransferResponse,
  StakeAccountInfoResponse,
} from "./types/index.js";
import { FireblocksService, IagonApiService, StakingService } from "./services/index.js";
import { MIN_CHANGE_LOVELACE, MIN_RECIPIENT_LOVELACE, tokenTransactionFee } from "./constants.js";

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
  stakingService: StakingService;
  network: Networks;
  logger: Logger;
}

export class FireblocksCardanoRawSDK {
  private readonly fireblocksService: FireblocksService;
  private readonly iagonApiService: IagonApiService;
  private readonly stakingService: StakingService;
  private network: Networks;
  private vaultAccountId: string;
  private addresses: Map<number, string> = new Map();
  private publicKeys: Map<string, string> = new Map();
  private readonly logger: Logger;

  /**
   * Creates a new FireblocksCardanoRawSDK instance
   *
   * @param config - SDK configuration
   */
  constructor(config: SDKConfig) {
    this.logger = config.logger;

    this.fireblocksService = config.fireblocksService;
    this.iagonApiService = config.iagonApiService;
    this.stakingService = config.stakingService;
    this.network = config.network;

    this.vaultAccountId = config.vaultAccountId;

    this.logger.info("FireblocksCardanoRawSDK initialized successfully");
  }

  public static createInstance = async (params: {
    fireblocksConfig: ConfigurationOptions;
    vaultAccountId: string;
    network: Networks;
  }): Promise<FireblocksCardanoRawSDK> => {
    try {
      const logger = new Logger(`app:fireblocks-cardano-raw-sdk`);

      const { fireblocksConfig, vaultAccountId, network } = params;

      if (network === Networks.PREVIEW) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const fireblocksService = new FireblocksService(fireblocksConfig);
      const iagonApiService = new IagonApiService(network);
      const stakingService = new StakingService(fireblocksService, iagonApiService, network);
      const assetId = network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
      const wallet = await fireblocksService.getVaultAccountAddress(vaultAccountId, assetId);

      const address = wallet.address;

      if (!address) {
        throw new Error(
          `Invalid address found for vault account ${vaultAccountId} and asset ${assetId}`
        );
      }

      const sdkInstance = new FireblocksCardanoRawSDK({
        fireblocksService,
        iagonApiService,
        stakingService,
        network,
        vaultAccountId,
        logger,
      });

      return sdkInstance;
    } catch (error: any) {
      throw new Error(
        `Error creating FireblocksCardanoRawSDK: ${error instanceof Error ? error.message : error}`
      );
    }
  };

  /**
   * Get balance by address for a vault account
   */
  public getBalanceByAddress = async (
    options: { index?: number; groupByPolicy?: boolean } = {}
  ): Promise<BalanceResponse | GroupedBalanceResponse> => {
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
   * Get total balance for all addresses in a vault account
   */
  public getVaultBalance = async (
    options: {
      groupBy?: GroupByOptions;
    } = {}
  ): Promise<VaultBalanceResponse> => {
    const { groupBy = GroupByOptions.TOKEN } = options;

    this.logger.info(`Getting vault balance for vault ${this.vaultAccountId}, groupBy: ${groupBy}`);

    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;

    const addresses = await this.fireblocksService.getVaultAccountAddresses(
      this.vaultAccountId,
      assetId
    );

    if (!addresses || addresses.length === 0) {
      this.logger.warn(`No addresses found for vault ${this.vaultAccountId}`);
      return this.getEmptyVaultBalance(groupBy);
    }

    // Fetch balances for all addresses in parallel
    const balancePromises = addresses
      .filter((addrData) => addrData.address && addrData.addressFormat === "BASE") // Filter out addresses without an address field / non-base addresses
      .map(async (addrData) => {
        const address = addrData.address!;
        const index = addrData.bip44AddressIndex || 0;

        try {
          const balance = await this.iagonApiService.getBalanceByAddress({
            address,
            groupByPolicy: groupBy === GroupByOptions.POLICY,
          });
          return { address, index, balance };
        } catch (error) {
          this.logger.error(`Error fetching balance for address ${address}:`, error);
          return { address, index, balance: null };
        }
      });

    const results = await Promise.all(balancePromises);

    // Aggregate based on groupBy parameter
    return this.aggregateVaultBalance(results, groupBy);
  };

  /**
   * Get balance by credential for a vault account
   */
  public getBalanceByCredential = async (options: {
    credential: string;
    groupByPolicy?: boolean;
  }): Promise<BalanceResponse | GroupedBalanceResponse> => {
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
  }): Promise<BalanceResponse | GroupedBalanceResponse> => {
    const { stakeKey, groupByPolicy = false } = options;

    this.logger.info(`Getting balance for stake key ${stakeKey}`);

    return await this.iagonApiService.getBalanceByStakeKey({
      stakeKey,
      groupByPolicy,
    });
  };

  /**
   * Helper to return empty vault balance based on groupBy
   */
  private getEmptyVaultBalance(groupBy: GroupByOptions): VaultBalanceResponse {
    if (groupBy === GroupByOptions.ADDRESS) {
      return { addresses: [], totals: { ada: "0", tokens: [] } };
    } else if (groupBy === GroupByOptions.POLICY) {
      return { balances: [], totalAda: "0" };
    } else {
      return { balances: [{ assetId: "ADA", amount: "0", tokenName: "ADA" }] };
    }
  }

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
  public getTransactionDetails = async (
    hash: string
  ): Promise<TransactionDetailsResponse | null> => {
    return await this.iagonApiService.getTransactionDetails(hash);
  };

  /**
   * Get UTXOs for a vault account address
   */
  public getUtxosByAddress = async (index: number = 0): Promise<UtxoIagonResponse> => {
    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
    const address = await this.getAddressByIndex(assetId, index);

    this.logger.info(
      `Getting UTXOs for vault ${this.vaultAccountId} at index ${index} (address: ${address})`
    );

    return await this.iagonApiService.getUtxosByAddress(address);
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
      note: "Transfer of Cardano tokens via FireblocksCardanoRawSDK",
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

    const txData = await this.fireblocksService.broadcastTransaction(transactionPayload);

    const signatureResponse = txData?.data[0];

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
   * @throws IagonApiError with 400 status code for validation errors
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
      recipientVaultAccountId,
      recipientIndex = 0,
      tokenPolicyId,
      tokenName,
      requiredTokenAmount,
    } = options;

    // Validate that exactly one recipient option is provided
    if (!recipientAddress && !recipientVaultAccountId) {
      throw new IagonApiError(
        "Either recipientAddress or recipientVaultAccountId must be provided",
        400,
        "ValidationError",
        { providedOptions: { recipientAddress, recipientVaultAccountId } },
        "FireblocksCardanoRawSDK"
      );
    }
    if (recipientAddress && recipientVaultAccountId) {
      throw new IagonApiError(
        "Cannot specify both recipientAddress and recipientVaultAccountId",
        400,
        "ValidationError",
        { providedOptions: { recipientAddress, recipientVaultAccountId } },
        "FireblocksCardanoRawSDK"
      );
    }

    const minRecipientLovelace = MIN_RECIPIENT_LOVELACE;
    const minChangeLovelace = MIN_CHANGE_LOVELACE;

    const assetId =
      this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;

    try {
      // Resolve recipient address
      let resolvedRecipientAddress: string;
      if (recipientVaultAccountId) {
        // Vault-to-vault transfer: get the recipient address from the vault account
        const recipientAddressData = await this.fireblocksService.getVaultAccountAddress(
          recipientVaultAccountId,
          assetId,
          recipientIndex
        );
        if (!recipientAddressData.address) {
          throw new IagonApiError(
            `No address found for recipient vault account ${recipientVaultAccountId} at index ${recipientIndex}`,
            404,
            "AddressNotFound",
            { recipientVaultAccountId, recipientIndex },
            "FireblocksCardanoRawSDK"
          );
        }
        resolvedRecipientAddress = recipientAddressData.address;
        this.logger.info(
          `Initiating vault-to-vault transfer: ${requiredTokenAmount} ${tokenName} from vault ${this.vaultAccountId} to vault ${recipientVaultAccountId} (${resolvedRecipientAddress})`
        );
      } else {
        // Direct address transfer
        resolvedRecipientAddress = recipientAddress!;
        this.logger.info(
          `Initiating transfer: ${requiredTokenAmount} ${tokenName} to ${resolvedRecipientAddress}`
        );
      }

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
        recipientAddress: resolvedRecipientAddress,
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
   * Enriches a webhook payload with detailed Cardano transaction data
   *
   * @param payload - The webhook payload to enrich
   * @returns The enriched webhook payload with cardanoTokensData if applicable
   */

  public enrichWebhookPayload = async (payload: WebhookPayloadData): Promise<any> => {
    if (
      payload.eventType !== WebhookEventTypes.TRANSACTION_CREATED &&
      payload.eventType !== WebhookEventTypes.TRANSACTION_STATUS_UPDATED &&
      payload.eventType !== WebhookEventTypes.TRANSACTION_APPROVAL_STATUS_UPDATED &&
      payload.eventType !== WebhookEventTypes.TRANSACTION_NETWORK_RECORDS_PROCESSING_COMPLETED
    ) {
      return payload;
    }

    const transactionAsset = payload.data.assetId;
    if (transactionAsset !== SupportedAssets.ADA && transactionAsset !== SupportedAssets.ADA_TEST) {
      this.logger.info(
        `Webhook received for non-ADA asset: ${transactionAsset}, skipping enrichment.`
      );
      return payload;
    }
    const txHash = payload.data.txHash;
    if (!txHash) {
      this.logger.warn("Webhook payload missing txHash, cannot enrich.");
      return payload;
    }

    this.logger.info(`Enriching webhook payload for ADA transaction: ${txHash}`);

    const detailedTx = await this.iagonApiService.getTransactionDetails(txHash);

    if (!detailedTx) {
      this.logger.warn(`Transaction not found: ${txHash}`);
      return payload;
    }

    const filteredInputs = detailedTx.data.inputs.filter((input) => input.value.assets);

    if (filteredInputs.length === 0) {
      this.logger.info(`No asset inputs found in transaction: ${txHash}`);
      return payload;
    }

    const enrichedPayload = {
      ...payload,
      data: {
        ...payload.data,
        cardanoTokensData: detailedTx.data,
      },
    };

    this.logger.info(`Webhook payload enriched for transaction: ${txHash}`);
    return enrichedPayload;
  };

  /**
   * Get public key for a vault account address with caching
   */
  public getPublicKey = async (change: number = 0, addressIndex: number = 0): Promise<string> => {
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
    id: string;
    data: Array<{
      signature: SignedMessageSignature;
      content?: string;
      publicKey?: string;
      algorithm?: SignedMessageAlgorithmEnum;
    }>;
  } | null> => {
    return await this.fireblocksService.broadcastTransaction(transactionRequest);
  };

  /**
   * Helper to aggregate vault balances based on groupBy option
   */
  private aggregateVaultBalance(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>,
    groupBy: GroupByOptions
  ): VaultBalanceResponse {
    if (groupBy === GroupByOptions.ADDRESS) {
      return this.aggregateByAddress(results);
    } else if (groupBy === GroupByOptions.POLICY) {
      return this.aggregateByPolicy(results);
    } else {
      return this.aggregateByToken(results);
    }
  }

  /**
   * Aggregate balances by token (default view)
   */
  private aggregateByToken(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>
  ): VaultBalanceTokenResponse {
    const tokenMap = new Map<string, bigint>();
    let totalAda = BigInt(0);

    for (const result of results) {
      if (!result.balance || !result.balance.success) continue;

      const bal = result.balance.data;
      if (!bal) continue;

      // Add ADA
      totalAda += BigInt(bal.lovelace || 0);

      // Add tokens
      if (bal.assets) {
        for (const [assetId, amount] of Object.entries(bal.assets)) {
          const current = tokenMap.get(assetId) || BigInt(0);
          tokenMap.set(assetId, current + BigInt(amount as number));
        }
      }
    }

    const tokens: VaultBalanceByToken[] = Array.from(tokenMap.entries()).map(
      ([assetId, amount]) => ({
        assetId,
        amount: amount.toString(),
        tokenName: decodeAssetName(assetId),
      })
    );

    return {
      balances: [{ assetId: "ADA", amount: totalAda.toString(), tokenName: "ADA" }, ...tokens],
    };
  }

  /**
   * Aggregate balances by address
   */
  private aggregateByAddress(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>
  ): VaultBalanceAddressResponse {
    const addresses: VaultBalanceByAddress[] = [];
    let totalAda = BigInt(0);
    const totalTokenMap = new Map<string, bigint>();

    for (const result of results) {
      if (!result.balance || !result.balance.success) {
        addresses.push({
          address: result.address,
          index: result.index,
          ada: "0",
          tokens: [],
        });
        continue;
      }

      const bal = result.balance.data;
      if (!bal) {
        addresses.push({
          address: result.address,
          index: result.index,
          ada: "0",
          tokens: [],
        });
        continue;
      }

      const addressAda = BigInt(bal.lovelace || 0);
      const addressTokens = new Map<string, bigint>();

      if (bal.assets) {
        for (const [assetId, amount] of Object.entries(bal.assets)) {
          const current = addressTokens.get(assetId) || BigInt(0);
          addressTokens.set(assetId, current + BigInt(amount as number));
        }
      }

      totalAda += addressAda;

      const tokens: Array<{ assetId: string; amount: string; tokenName: string }> = Array.from(
        addressTokens.entries()
      ).map(([assetId, amount]) => {
        const current = totalTokenMap.get(assetId) || BigInt(0);
        totalTokenMap.set(assetId, current + amount);
        return { assetId, amount: amount.toString(), tokenName: decodeAssetName(assetId) };
      });

      addresses.push({
        address: result.address,
        index: result.index,
        ada: addressAda.toString(),
        tokens,
      });
    }

    const totalTokens: Array<{ assetId: string; amount: string; tokenName: string }> = Array.from(
      totalTokenMap.entries()
    ).map(([assetId, amount]) => ({
      assetId,
      amount: amount.toString(),
      tokenName: decodeAssetName(assetId),
    }));

    return {
      addresses,
      totals: {
        ada: totalAda.toString(),
        tokens: totalTokens,
      },
    };
  }

  /**
   * Aggregate balances by policy
   */
  private aggregateByPolicy(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>
  ): VaultBalancePolicyResponse {
    const policyMap = new Map<string, Map<string, bigint>>();
    let totalAda = BigInt(0);

    for (const result of results) {
      if (!!!result.balance || !result.balance.success) continue;

      const balance = result.balance.data;
      if (!balance) continue;

      totalAda += BigInt(balance.lovelace || 0);

      if (balance.assets && typeof balance.assets === "object") {
        for (const [policyId, tokens] of Object.entries(balance.assets)) {
          if (typeof tokens === "object" && tokens !== null) {
            let policyTokens = policyMap.get(policyId);
            if (!policyTokens) {
              policyTokens = new Map<string, bigint>();
              policyMap.set(policyId, policyTokens);
            }

            for (const [tokenName, amount] of Object.entries(tokens)) {
              // Keep hex token name as key
              const current = policyTokens.get(tokenName) || BigInt(0);
              policyTokens.set(tokenName, current + BigInt(amount as number));
            }
          }
        }
      }
    }

    const balances: VaultBalanceByPolicy[] = Array.from(policyMap.entries()).map(
      ([policyId, tokens]) => {
        const tokenObj: { [key: string]: { amount: string; tokenName: string } } = {};
        for (const [hexTokenName, amount] of tokens.entries()) {
          tokenObj[hexTokenName] = {
            tokenName: decodeAssetName(`${policyId}.${hexTokenName}`),
            amount: amount.toString(),
          };
        }
        return { policyId, tokens: tokenObj };
      }
    );

    return {
      balances,
      totalAda: totalAda.toString(),
    };
  }

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
   * Get direct access to the Staking service
   * @internal - For advanced usage only
   */
  public getStakingService(): StakingService {
    return this.stakingService;
  }

  // ======================
  // Staking Operations
  // ======================

  /**
   * Register staking credential for a vault account
   *
   * This is the first step to enable staking. It registers the staking key on-chain
   * and requires a deposit of 2 ADA (DEPOSIT_AMOUNT) which will be returned upon deregistration.
   *
   * @param options - Registration options
   * @returns Transaction result with hash and status
   * @throws Error if registration fails
   *
   * @example
   * ```typescript
   * const result = await sdk.registerStakingCredential({
   *   vaultAccountId: "0",
   *   depositAmount: 2000000, // 2 ADA
   *   fee: 300000 // 0.3 ADA
   * });
   * console.log(`Registration TX: ${result.txHash}`);
   * ```
   */
  public registerStakingCredential = async (
    options: RegisterStakingOptions
  ): Promise<
    (StakingTransactionResult & { stakeAddress: string; addressIndex: number }) | null
  > => {
    this.logger.info(`Registering staking credential for vault account ${options.vaultAccountId}`);
    return await this.stakingService.registerStakingCredential(options);
  };

  /**
   * Delegate ADA to a stake pool
   *
   * Delegates the staking credential to a specific stake pool. The staking credential
   * must be registered first using registerStakingCredential().
   *
   * @param options - Delegation options including pool ID
   * @returns Transaction result with hash and status
   * @throws Error if delegation fails
   *
   * @example
   * ```typescript
   * const result = await sdk.delegateToPool({
   *   vaultAccountId: "0",
   *   poolId: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy", // Pool ID in bech32 or hex
   *   fee: 300000 // 0.3 ADA
   * });
   * console.log(`Delegation TX: ${result.txHash}`);
   * ```
   */
  public delegateToPool = async (options: DelegationOptions): Promise<StakingTransactionResult> => {
    this.logger.info(
      `Delegating to pool ${options.poolId} for vault account ${options.vaultAccountId}`
    );
    return await this.stakingService.delegateToPool(options);
  };

  /**
   * Deregister staking credential
   *
   * Deregisters the staking credential and withdraws all available rewards.
   * Returns the 2 ADA deposit that was paid during registration.
   *
   * @param options - Deregistration options
   * @returns Transaction result with hash and status
   * @throws Error if deregistration fails
   *
   * @example
   * ```typescript
   * const result = await sdk.deregisterStakingCredential({
   *   vaultAccountId: "0",
   *   fee: 300000 // 0.3 ADA
   * });
   * console.log(`Deregistration TX: ${result.txHash}`);
   * ```
   */
  public deregisterStakingCredential = async (
    options: DeregisterStakingOptions
  ): Promise<StakingTransactionResult> => {
    this.logger.info(
      `Deregistering staking credential for vault account ${options.vaultAccountId}`
    );
    return await this.stakingService.deregisterStakingCredential(options);
  };

  /**
   * Withdraw staking rewards
   *
   * Withdraws accumulated staking rewards without deregistering the staking credential.
   * You can continue to stake after withdrawing rewards.
   *
   * @param options - Withdrawal options with optional limit
   * @returns Transaction result with hash and status
   * @throws Error if withdrawal fails
   *
   * @example
   * ```typescript
   * // Withdraw all available rewards
   * const result = await sdk.withdrawRewards({
   *   vaultAccountId: "0",
   *   fee: 300000 // 0.3 ADA
   * });
   *
   * // Withdraw up to 5 ADA
   * const result = await sdk.withdrawRewards({
   *   vaultAccountId: "0",
   *   limit: 5000000, // 5 ADA in Lovelace
   *   fee: 300000
   * });
   * console.log(`Withdrawal TX: ${result.txHash}`);
   * ```
   */
  public withdrawRewards = async (options: WithdrawRewardsOptions): Promise<TransferResponse> => {
    this.logger.info(`Withdrawing rewards for vault account ${options.vaultAccountId}`);
    return await this.stakingService.withdrawRewards(options);
  };

  public getStakeAccountInfo = async (
    vaultAccountId: string
  ): Promise<StakeAccountInfoResponse> => {
    this.logger.info(`Getting staking account info for vault account ${vaultAccountId}`);

    const stakeAddress = await this.stakingService.getStakeAddress(vaultAccountId);
    return await this.iagonApiService.getStakeAccountInfo(stakeAddress);
  };

  /**
   * Query staking rewards for a vault account
   *
   * Retrieves detailed information about staking rewards including:
   * - Individual rewards per epoch
   * - Historical withdrawals
   * - Total and available rewards
   *
   * @param vaultAccountId - Vault account ID
   * @returns Detailed rewards data
   * @throws Error if query fails
   *
   * @example
   * ```typescript
   * const rewards = await sdk.queryStakingRewards("0");
   * console.log(`Available rewards: ${rewards.availableRewards} Lovelace`);
   * console.log(`Total rewards earned: ${rewards.totalRewards} Lovelace`);
   * console.log(`Total withdrawn: ${rewards.totalWithdrawals} Lovelace`);
   *
   * // List rewards by epoch
   * rewards.rewards.forEach(r => {
   *   console.log(`Epoch ${r.epoch}: ${r.amount} from pool ${r.poolId}`);
   * });
   * ```
   */
  public queryStakingRewards = async (vaultAccountId: string): Promise<RewardsData> => {
    this.logger.info(`Querying staking rewards for vault account ${vaultAccountId}`);
    return await this.stakingService.queryStakingRewards(vaultAccountId);
  };

  /**
   * Delegate voting power to a DRep (Delegated Representative) - Conway Era Governance
   *
   * In Cardano's Conway era, ADA holders can delegate their voting power to DReps
   * who participate in on-chain governance. This is separate from stake pool delegation.
   *
   * Options:
   * - "always-abstain": Automatically abstain from all governance votes
   * - "always-no-confidence": Automatically vote no confidence on all proposals
   * - "custom-drep": Delegate to a specific DRep (requires drepId)
   *
   * @param options - DRep delegation options
   * @returns Transaction result with hash and status
   * @throws Error if delegation fails
   *
   * @example
   * ```typescript
   * // Delegate to always abstain
   * const result = await sdk.delegateToDRep({
   *   vaultAccountId: "0",
   *   drepAction: "always-abstain",
   *   fee: 1000000 // 1 ADA
   * });
   *
   * // Delegate to a specific DRep
   * const result = await sdk.delegateToDRep({
   *   vaultAccountId: "0",
   *   drepAction: "custom-drep",
   *   drepId: "drep1abc123...", // DRep ID in hex format
   *   fee: 1000000
   * });
   * console.log(`DRep delegation TX: ${result.txHash}`);
   * ```
   */
  public delegateToDRep = async (
    options: DRepDelegationOptions
  ): Promise<StakingTransactionResult> => {
    this.logger.info(
      `Delegating to DRep (${options.drepAction}) for vault account ${options.vaultAccountId}`
    );
    return await this.stakingService.delegateToDRep(options);
  };

  /**
   * Get the stake address for a vault account
   *
   * Extracts the BASE address from the vault account and derives the stake address.
   * The stake address is used to identify staking credentials and query staking-related
   * information like rewards, delegation history, and registration status.
   *
   * @param vaultAccountId - The vault account ID
   * @returns The stake address in bech32 format (stake1... or stake_test1...)
   * @throws Error if no BASE address is found for the vault account
   *
   * @example
   * ```typescript
   * const stakeAddress = await sdk.getStakeAddress("0");
   * console.log(`Stake address: ${stakeAddress}`);
   * // Output: stake1u9r76ypf5fskppa0cmttas05cgcswrttn6jrq4yd7jpdnvc7gt0yc
   * ```
   */
  public getStakeAddress = async (vaultAccountId: string): Promise<string> => {
    this.logger.info(`Getting stake address for vault account ${vaultAccountId}`);
    return await this.stakingService.getStakeAddress(vaultAccountId);
  };

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
    this.logger.info("Shutting down FireblocksCardanoRawSDK...");
    this.clearCache();
    this.logger.info("FireblocksCardanoRawSDK shutdown complete");
  }
}
