import {
  ConfigurationOptions,
  VaultWalletAddress,
  TransactionRequest,
  TransactionOperation,
  TransferPeerPathType,
} from "@fireblocks/ts-sdk";

import {
  Logger,
  buildAdaTransactionWithCalculatedFee,
  fetchAndSelectUtxosForAda,
  fetchAndSelectUtxosForMultiToken,
  buildCntTransactionWithCalculatedFee,
  buildMultiTokenTransactionWithCalculatedFee,
  buildConsolidationTransactionWithCalculatedFee,
  countDistinctPolicies,
  WITNESS_COUNT_PAYMENT_KEY_ONLY,
  calculateTransactionFee,
  calculateTtl,
  createTransactionInputs,
  fetchUtxos,
  fetchAndSelectUtxosForCnt,
  submitTransaction,
  decodeAssetName,
  formatWithDecimals,
  getStakeAddressFromBaseAddress,
} from "./utils/index.js";

import {
  BalanceResponse,
  GroupedBalanceResponse,
  DetailedTxHistoryResponse,
  CntTransferOpts,
  TransactionHistoryResponse,
  GroupedTransactionHistoryResponse,
  GroupedDetailedTxHistoryResponse,
  TransactionHistoryItem,
  DetailedTransaction,
  LastUpdated,
  TransactionPagination,
  TransactionDetailsResponse,
  WebhookPayloadData,
  SupportedAssets,
  Networks,
  UtxoIagonResponse,
  UtxoData,
  GroupByOptions,
  VaultBalanceResponse,
  VaultBalanceTokenResponse,
  VaultBalanceByToken,
  VaultBalanceAddressResponse,
  VaultBalanceByAddress,
  VaultBalancePolicyResponse,
  VaultBalanceByPolicy,
  SdkApiError,
  RegisterStakingOptions,
  StakingTransactionResult,
  DelegationOptions,
  DeregisterStakingOptions,
  WithdrawRewardsOptions,
  DRepDelegationOptions,
  RegisterAsDRepOptions,
  RegisterAsDRepResult,
  CastVoteOptions,
  CastVoteResult,
  RewardsData,
  WebhookEventTypes,
  StakeAccountInfoResponse,
  HealthStatusResponse,
  CurrentEpochResponse,
  AssetInfoResponse,
  PoolInfoResponse,
  PoolMetadataResponse,
  PoolDelegatorsResponse,
  PoolDelegatorsListResponse,
  PoolBlocksResponse,
  TokenMetadata,
  CntFeeEstimationRequest,
  CntFeeEstimationResponse,
  AdaTransferOpts,
  AdaFeeEstimationRequest,
  AdaFeeEstimationResponse,
  AdaTransferResult,
  MultiTokenTransferOpts,
  MultiTokenTransferResult,
  MultiTokenFeeEstimationRequest,
  MultiTokenFeeEstimationResponse,
  ConsolidateUtxosOpts,
  ConsolidateUtxosResult,
} from "./types/index.js";

import { FireblocksService, IagonApiService, StakingService } from "./services/index.js";
import { CardanoAmounts, CardanoConstants, FireblocksWebhookConstants } from "./constants.js";

import {
  Address,
  Ed25519Signature,
  PublicKey,
  Transaction,
  TransactionBody,
  TransactionWitnessSet,
  Vkey,
  Vkeywitness,
  Vkeywitnesses,
} from "@emurgo/cardano-serialization-lib-nodejs";
import { blake2b } from "blakejs";
import crypto from "crypto";
import { createRemoteJWKSet, compactVerify } from "jose";

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
  private jwksCache: Map<string, ReturnType<typeof createRemoteJWKSet>> = new Map();

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

  /**
   * Gets the Fireblocks asset ID for the current network
   * @returns SupportedAssets.ADA for mainnet, SupportedAssets.ADA_TEST for testnets
   */
  private get assetId(): SupportedAssets {
    return this.network === Networks.MAINNET ? SupportedAssets.ADA : SupportedAssets.ADA_TEST;
  }

  public static createInstance = async (params: {
    fireblocksConfig: ConfigurationOptions;
    vaultAccountId: string;
    network: Networks;
    iagonApiKey: string;
    /** Asset metadata cache TTL in milliseconds (default: 1 hour) */
    assetCacheTTL?: number;
    /** Disable SSL certificate verification (use only in development) */
    disableSslVerification?: boolean;
  }): Promise<FireblocksCardanoRawSDK> => {
    try {
      const logger = new Logger(`app:fireblocks-cardano-raw-sdk`);

      const {
        fireblocksConfig,
        vaultAccountId,
        network,
        iagonApiKey,
        assetCacheTTL,
        disableSslVerification = false,
      } = params;

      if (network === Networks.PREVIEW) {
        throw new Error(`Unsupported network: ${network}`);
      }

      const fireblocksService = new FireblocksService(fireblocksConfig);
      const iagonApiService = new IagonApiService(
        iagonApiKey,
        network,
        assetCacheTTL,
        disableSslVerification
      );
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

  public checkIagonHealth = async (): Promise<HealthStatusResponse> => {
    return await this.iagonApiService.checkHealth();
  };

  /**
   * Get balance by address for a vault account
   * @param options.index - Address index (default: 0)
   * @param options.groupByPolicy - Group assets by policy (default: false)
   * @param options.includeMetadata - Enrich tokens with metadata (default: false)
   */
  public getBalanceByAddress = async (
    options: { index?: number; groupByPolicy?: boolean; includeMetadata?: boolean } = {}
  ): Promise<BalanceResponse | GroupedBalanceResponse | any> => {
    const { index = 0, groupByPolicy = false, includeMetadata = false } = options;

    // Use cached address fetching
    const address = await this.getAddressByIndex(this.assetId, index);

    this.logger.info(
      `Getting balance for address ${address} (vault: ${this.vaultAccountId}, includeMetadata: ${includeMetadata})`
    );

    const response = await this.iagonApiService.getBalanceByAddress({
      address,
      groupByPolicy,
    });

    if (includeMetadata) {
      return await this.enrichIagonResponse(response);
    }

    return response;
  };

  /**
   * Get total balance for all addresses in a vault account
   * @param options.groupBy - How to group the balance data
   * @param options.includeMetadata - Whether to enrich tokens with metadata (names, decimals, logos)
   */
  public getVaultBalance = async (
    options: {
      groupBy?: GroupByOptions;
      includeMetadata?: boolean;
    } = {}
  ): Promise<VaultBalanceResponse> => {
    const { groupBy = GroupByOptions.TOKEN, includeMetadata = false } = options;

    this.logger.info(
      `Getting vault balance for vault ${this.vaultAccountId}, groupBy: ${groupBy}, includeMetadata: ${includeMetadata}`
    );

    const addresses = await this.fireblocksService.getVaultAccountAddresses(
      this.vaultAccountId,
      this.assetId
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
    return this.aggregateVaultBalance(results, groupBy, includeMetadata);
  };

  /**
   * Get balance by credential for a vault account
   * @param options.credential - Payment credential
   * @param options.groupByPolicy - Group assets by policy (default: false)
   * @param options.includeMetadata - Enrich tokens with metadata (default: false)
   */
  public getBalanceByCredential = async (options: {
    credential: string;
    groupByPolicy?: boolean;
    includeMetadata?: boolean;
  }): Promise<BalanceResponse | GroupedBalanceResponse | any> => {
    const { credential, groupByPolicy = false, includeMetadata = false } = options;

    this.logger.info(
      `Getting balance for credential ${credential} (includeMetadata: ${includeMetadata})`
    );

    const response = await this.iagonApiService.getBalanceByCredential({
      credential,
      groupByPolicy,
    });

    if (includeMetadata) {
      return await this.enrichIagonResponse(response);
    }

    return response;
  };

  /**
   * Get balance by stake key for a vault account
   * Automatically derives the stake key from the vault account address.
   * Note: The stake key is shared across all addresses in the vault account.
   * @param options.groupByPolicy - Group assets by policy (default: false)
   * @param options.includeMetadata - Enrich tokens with metadata (default: false)
   */
  public getBalanceByStakeKey = async (
    options: {
      groupByPolicy?: boolean;
      includeMetadata?: boolean;
    } = {}
  ): Promise<BalanceResponse | GroupedBalanceResponse | any> => {
    const { groupByPolicy = false, includeMetadata = false } = options;

    // Get the base address for this vault account (using index 0, but stake key is the same for all indices)
    const baseAddress = await this.getAddressByIndex(this.assetId, 0);

    // Derive the stake key from the base address
    const isMainnet = this.network === Networks.MAINNET;
    const stakeKey = getStakeAddressFromBaseAddress(baseAddress, isMainnet);

    this.logger.info(
      `Getting balance for stake key ${stakeKey} (vault: ${this.vaultAccountId}, includeMetadata: ${includeMetadata})`
    );

    const response = await this.iagonApiService.getBalanceByStakeKey({
      stakeKey,
      groupByPolicy,
    });

    if (includeMetadata) {
      return await this.enrichIagonResponse(response);
    }

    return response;
  };

  /**
   * Helper to return empty vault balance based on groupBy
   */
  private getEmptyVaultBalance(groupBy: GroupByOptions): VaultBalanceResponse {
    if (groupBy === GroupByOptions.ADDRESS) {
      return { addresses: [], totals: { lovelace: "0", tokens: [] } };
    } else if (groupBy === GroupByOptions.POLICY) {
      return { balances: [], totalLovelace: "0" };
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
   * Resolves recipient address from either a direct address or a vault account ID.
   * Validates that exactly one recipient option is provided.
   */
  private async resolveRecipientAddress(
    recipientAddress: string | undefined,
    recipientVaultAccountId: string | undefined,
    recipientIndex: number = 0
  ): Promise<string> {
    if (!recipientAddress && !recipientVaultAccountId) {
      throw new SdkApiError(
        "Either recipientAddress or recipientVaultAccountId must be provided",
        400,
        "ValidationError",
        { providedOptions: { recipientAddress, recipientVaultAccountId } },
        "FireblocksCardanoRawSDK"
      );
    }
    if (recipientAddress && recipientVaultAccountId) {
      throw new SdkApiError(
        "Cannot specify both recipientAddress and recipientVaultAccountId",
        400,
        "ValidationError",
        { providedOptions: { recipientAddress, recipientVaultAccountId } },
        "FireblocksCardanoRawSDK"
      );
    }
    if (recipientVaultAccountId) {
      const recipientAddressData = await this.fireblocksService.getVaultAccountAddress(
        recipientVaultAccountId,
        this.assetId,
        recipientIndex
      );
      if (!recipientAddressData.address) {
        throw new SdkApiError(
          `No address found for recipient vault account ${recipientVaultAccountId} at index ${recipientIndex}`,
          404,
          "AddressNotFound",
          { recipientVaultAccountId, recipientIndex },
          "FireblocksCardanoRawSDK"
        );
      }
      return recipientAddressData.address;
    }
    return recipientAddress!;
  }

  /**
   * Fetches current network slot and returns TTL for transaction building.
   */
  private async fetchCurrentTtl(): Promise<number> {
    const epochResponse = await this.iagonApiService.getCurrentEpoch();
    this.logger.info(`Current slot: ${epochResponse.data.tip.slot}, calculating TTL`);
    return calculateTtl(epochResponse.data.tip.slot);
  }

  /**
   * Logs an error and re-throws it, wrapping non-Error values in a typed Error.
   */
  private logAndRethrow(context: string, error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`${context} failed: ${errorMessage}`);
    if (error instanceof Error) throw error;
    throw new Error(`${context}Failed: ${errorMessage}`);
  }

  /**
   * Fetches transaction history across all vault addresses.
   * Shared by getAllTransactionHistory() and getAllDetailedTxHistory().
   */
  private async fetchAllVaultHistory<T extends { tx_hash: string; slot_no: number }>(
    fetchFn: (params: {
      address: string;
      limit?: number;
      offset?: number;
      fromSlot?: number;
    }) => Promise<{ success: boolean; data?: T[]; last_updated?: LastUpdated }>,
    options: { limit?: number; offset?: number; fromSlot?: number; groupByAddress?: boolean }
  ): Promise<{
    success: boolean;
    data: T[] | Record<string, T[]>;
    pagination: TransactionPagination;
    last_updated: LastUpdated;
  }> {
    const emptyLastUpdated: LastUpdated = { slot_no: 0, block_hash: "", block_time: "" };
    const emptyPagination: TransactionPagination = {
      limit: 0,
      offset: 0,
      total: 0,
      hasMore: false,
    };

    const addressesResponse = await this.fireblocksService.getVaultAccountAddresses(
      this.vaultAccountId,
      this.assetId
    );

    if (!addressesResponse || addressesResponse.length === 0) {
      this.logger.warn(`No addresses found for vault account ${this.vaultAccountId}`);
      return {
        success: true,
        data: options.groupByAddress ? {} : [],
        pagination: emptyPagination,
        last_updated: emptyLastUpdated,
      };
    }

    const validAddresses = addressesResponse.filter((addr) => addr.address);
    const allHistories = await Promise.all(
      validAddresses.map((addr) => fetchFn({ address: addr.address!, ...options }))
    );

    const mostRecentUpdate = allHistories.reduce((latest, current) => {
      if (!latest || (current.last_updated?.slot_no || 0) > (latest.slot_no || 0)) {
        return current.last_updated || latest;
      }
      return latest;
    }, allHistories[0]?.last_updated || emptyLastUpdated);

    if (options.groupByAddress) {
      const groupedData: Record<string, T[]> = {};
      let totalTransactions = 0;

      validAddresses.forEach((addr, index) => {
        const transactions = allHistories[index].data || [];
        transactions.sort((a, b) => (b.slot_no || 0) - (a.slot_no || 0));
        groupedData[addr.address!] = transactions;
        totalTransactions += transactions.length;
      });

      const paginationLimit = options.limit || totalTransactions;
      const paginationOffset = options.offset || 0;

      return {
        success: true,
        data: groupedData,
        pagination: {
          limit: paginationLimit,
          offset: paginationOffset,
          total: totalTransactions,
          hasMore: paginationOffset + paginationLimit < totalTransactions,
        },
        last_updated: mostRecentUpdate,
      };
    }

    // Flat mode: merge, add address field, sort, deduplicate, paginate
    const flatData: T[] = [];
    validAddresses.forEach((addr, index) => {
      const transactions = allHistories[index].data || [];
      transactions.forEach((tx) => flatData.push({ ...tx, address: addr.address }));
    });

    flatData.sort((a, b) => (b.slot_no || 0) - (a.slot_no || 0));

    const uniqueTransactions = flatData.filter(
      (tx, index, self) => index === self.findIndex((t) => t.tx_hash === tx.tx_hash)
    );

    const totalTransactions = uniqueTransactions.length;
    const paginationLimit = options.limit || totalTransactions;
    const paginationOffset = options.offset || 0;

    return {
      success: true,
      data: uniqueTransactions.slice(paginationOffset, paginationOffset + paginationLimit),
      pagination: {
        limit: paginationLimit,
        offset: paginationOffset,
        total: totalTransactions,
        hasMore: paginationOffset + paginationLimit < totalTransactions,
      },
      last_updated: mostRecentUpdate,
    };
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
    const address = await this.getAddressByIndex(this.assetId, index);

    this.logger.info(
      `Getting UTXOs for vault ${this.vaultAccountId} at index ${index} (address: ${address})`
    );

    return await this.iagonApiService.getUtxosByAddress(address);
  };

  /**
   * Get UTXOs for all addresses in a vault account, grouped by address.
   */
  public getUtxosByVaultAccountId = async (): Promise<Record<string, UtxoData[]>> => {
    const addresses = await this.fireblocksService.getVaultAccountAddresses(
      this.vaultAccountId,
      this.assetId
    );

    this.logger.info(
      `Getting UTxOs for all ${addresses.length} addresses in vault ${this.vaultAccountId}`
    );

    const result: Record<string, UtxoData[]> = {};

    await Promise.all(
      addresses.map(async (addr) => {
        if (!addr.address) return;
        const response = await this.iagonApiService.getUtxosByAddress(addr.address);
        result[addr.address] = response.data ?? [];
      })
    );

    return result;
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
    const address = await this.getAddressByIndex(this.assetId, index);
    this.logger.info(
      `Getting transaction history for vault ${this.vaultAccountId}, asset ${this.assetId}, at index ${index} (address: ${address})`
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
    const address = await this.getAddressByIndex(this.assetId, index);

    this.logger.info(
      `Getting detailed transaction history for vault ${this.vaultAccountId}, asset ${this.assetId}, at index ${index} (address: ${address})`
    );

    return await this.iagonApiService.getDetailedTxHistory({ address, ...options });
  };

  /**
   * Get transaction history for all addresses in the vault account
   * @param options.groupByAddress - If true, returns data grouped by address. If false, returns flat array with address field
   */
  public getAllTransactionHistory = async (
    options: {
      limit?: number;
      offset?: number;
      fromSlot?: number;
      groupByAddress?: boolean;
    } = {}
  ): Promise<TransactionHistoryResponse | GroupedTransactionHistoryResponse> => {
    this.logger.info(
      `Getting transaction history for all addresses in vault ${this.vaultAccountId}`
    );
    return this.fetchAllVaultHistory<TransactionHistoryItem>(
      (params) => this.iagonApiService.getTransactionHistory(params),
      options
    ) as Promise<TransactionHistoryResponse | GroupedTransactionHistoryResponse>;
  };

  /**
   * Get detailed transaction history for all addresses in the vault account
   * @param options.groupByAddress - If true, returns data grouped by address. If false, returns flat array with address field
   */
  public getAllDetailedTxHistory = async (
    options: {
      limit?: number;
      offset?: number;
      fromSlot?: number;
      groupByAddress?: boolean;
    } = {}
  ): Promise<DetailedTxHistoryResponse | GroupedDetailedTxHistoryResponse> => {
    this.logger.info(
      `Getting detailed transaction history for all addresses in vault ${this.vaultAccountId}`
    );
    return this.fetchAllVaultHistory<DetailedTransaction>(
      (params) => this.iagonApiService.getDetailedTxHistory(params),
      options
    ) as Promise<DetailedTxHistoryResponse | GroupedDetailedTxHistoryResponse>;
  };

  /**
   * Selects and validates UTXOs for the transaction
   * Minimum lovelace values are calculated dynamically based on policies
   */
  private async selectAndValidateUtxos(params: {
    address: string;
    tokenPolicyId: string;
    tokenName: string;
    requiredTokenAmount: number;
    transactionFee: number;
  }) {
    const utxoResult = await fetchAndSelectUtxosForCnt({
      iagonApiService: this.iagonApiService,
      ...params,
    });

    if (!utxoResult) {
      throw new SdkApiError(
        "No suitable UTXOs found for this transaction",
        400,
        "UtxoSelectionFailed",
        {
          address: params.address,
          tokenPolicyId: params.tokenPolicyId,
          tokenName: params.tokenName,
        },
        "FireblocksCardanoRawSDK"
      );
    }

    const {
      selectedUtxos,
      accumulatedAda,
      accumulatedTokenAmount,
      minRecipientLovelace,
      minChangeLovelace,
    } = utxoResult;
    const adaTarget = minRecipientLovelace + params.transactionFee;

    if (accumulatedTokenAmount < params.requiredTokenAmount || accumulatedAda < adaTarget) {
      const tokenShortfall = Math.max(0, params.requiredTokenAmount - accumulatedTokenAmount);
      const adaShortfall = Math.max(0, adaTarget - accumulatedAda);

      let message = "Insufficient balance. ";
      if (tokenShortfall > 0) {
        message += `Token: need ${params.requiredTokenAmount.toLocaleString()}, have ${accumulatedTokenAmount.toLocaleString()} (short ${tokenShortfall.toLocaleString()}). `;
      }
      if (adaShortfall > 0) {
        const required = formatWithDecimals(adaTarget, CardanoConstants.ADA_DECIMALS);
        const recipient = formatWithDecimals(minRecipientLovelace, CardanoConstants.ADA_DECIMALS);
        const fee = formatWithDecimals(params.transactionFee, CardanoConstants.ADA_DECIMALS);
        const have = formatWithDecimals(accumulatedAda, CardanoConstants.ADA_DECIMALS);
        const short = formatWithDecimals(adaShortfall, CardanoConstants.ADA_DECIMALS);

        message += `ADA: need ${required.value} ADA (${required.raw} lovelace) = ${recipient.value} ADA for recipient + ${fee.value} ADA fee, have ${have.value} ADA (${have.raw} lovelace), short ${short.value} ADA (${short.raw} lovelace).`;
      }

      throw new SdkApiError(
        message.trim(),
        400,
        "InsufficientBalance",
        {
          requiredTokenAmount: params.requiredTokenAmount,
          accumulatedTokenAmount,
          tokenShortfall,
          requiredAda: adaTarget,
          accumulatedAda,
          adaShortfall,
          breakdown: {
            minRecipientLovelace,
            minChangeLovelace,
            transactionFee: params.transactionFee,
          },
        },
        "FireblocksCardanoRawSDK"
      );
    }

    return {
      selectedUtxos,
      accumulatedAda,
      accumulatedTokenAmount,
      minRecipientLovelace,
      minChangeLovelace,
    };
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

    const txData = await this.fireblocksService.signTransaction(transactionPayload);

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

    const signedTx = Transaction.new(txBody, witnessSet);

    // Verify the fee is sufficient using Cardano's min_fee calculation
    const minRequiredFee = calculateTransactionFee(signedTx);
    const allocatedFee = parseInt(txBody.fee().to_str());

    if (minRequiredFee > allocatedFee) {
      throw new SdkApiError(
        `Transaction requires minimum ${minRequiredFee} lovelace but only ${allocatedFee} lovelace was allocated. This indicates a bug in fee calculation.`,
        500,
        "FeeEstimationError",
        { minRequiredFee, allocatedFee, difference: minRequiredFee - allocatedFee },
        "FireblocksCardanoRawSDK"
      );
    }

    const feeDifference = allocatedFee - minRequiredFee;
    this.logger.info(
      `Transaction fee verified: allocated ${allocatedFee} lovelace, ` +
        `minimum required ${minRequiredFee} lovelace (margin: ${feeDifference} lovelace)`
    );

    return signedTx;
  }

  /**
   * Execute a transfer of Cardano tokens
   *
   * @param options - Transfer configuration options
   * @returns Transaction result with hash, sender address, token name, and fee information
   * @throws SdkApiError with 400 status code for validation errors
   * @throws Error if any step of the transfer process fails
   */
  /**
   * Private helper that prepares and validates transaction parameters
   * Shared by both estimateTransactionFee() and transfer()
   */
  private async prepareTransaction(params: {
    index?: number;
    recipientAddress?: string;
    recipientVaultAccountId?: string;
    recipientIndex?: number;
    tokenPolicyId: string;
    tokenName: string;
    requiredTokenAmount: number;
  }): Promise<{
    txBody: TransactionBody;
    senderAddress: string;
    resolvedRecipientAddress: string;
    minRecipientLovelace: number;
  }> {
    const {
      index = 0,
      recipientAddress,
      recipientVaultAccountId,
      recipientIndex = 0,
      tokenPolicyId,
      tokenName,
      requiredTokenAmount,
    } = params;

    // Block native ADA transfers
    const isNativeAdaTransfer =
      (tokenName === SupportedAssets.ADA || tokenName === SupportedAssets.ADA_TEST) &&
      tokenPolicyId === "";

    if ((!tokenPolicyId && !tokenName) || isNativeAdaTransfer) {
      throw new SdkApiError(
        "Native ADA transfers are not supported by this SDK. Please use the Fireblocks console for ADA transfers.",
        400,
        "UnsupportedOperation",
        { tokenPolicyId, tokenName },
        "FireblocksCardanoRawSDK"
      );
    }

    if (!tokenPolicyId || !tokenName) {
      throw new SdkApiError(
        "For token transfers, please provide both 'tokenPolicyId' and 'tokenName' parameters.",
        400,
        "UnsupportedOperation",
        { tokenPolicyId, tokenName },
        "FireblocksCardanoRawSDK"
      );
    }

    const resolvedRecipientAddress = await this.resolveRecipientAddress(
      recipientAddress,
      recipientVaultAccountId,
      recipientIndex
    );

    const senderAddress = await this.getAddressByIndex(this.assetId, index);

    const { selectedUtxos, minRecipientLovelace } = await this.selectAndValidateUtxos({
      address: senderAddress,
      tokenPolicyId,
      tokenName,
      requiredTokenAmount,
      transactionFee: CardanoAmounts.ESTIMATED_MAX_FEE,
    });

    const txInputs = createTransactionInputs(selectedUtxos);
    const ttl = await this.fetchCurrentTtl();

    const { txBody } = buildCntTransactionWithCalculatedFee(
      {
        requiredLovelace: minRecipientLovelace,
        recipientAddress: Address.from_bech32(resolvedRecipientAddress),
        senderAddress: Address.from_bech32(senderAddress),
        tokenPolicyId,
        tokenName,
        transferAmount: requiredTokenAmount,
        selectedUtxos,
      },
      txInputs,
      ttl,
      WITNESS_COUNT_PAYMENT_KEY_ONLY
    );

    return { txBody, senderAddress, resolvedRecipientAddress, minRecipientLovelace };
  }

  /**
   * Estimates transaction fee for a CNT transfer without signing or submitting
   *
   * @param request - Fee estimation request parameters
   * @returns Fee estimation response with detailed breakdown
   * @throws SdkApiError if validation fails or insufficient balance
   */
  public estimateTransactionFee = async (
    request: CntFeeEstimationRequest
  ): Promise<CntFeeEstimationResponse> => {
    const { requiredTokenAmount, grossAmount = false } = request;

    try {
      this.logger.info(
        `Estimating transaction fee for ${requiredTokenAmount} ${request.tokenName} (grossAmount: ${grossAmount})`
      );

      // Prepare transaction (reuses validation and building logic)
      const { txBody, minRecipientLovelace } = await this.prepareTransaction(request);

      // Extract fee from transaction body
      const feeLovelace = BigInt(txBody.fee().to_str());
      const feeFormatted = formatWithDecimals(Number(feeLovelace), CardanoConstants.ADA_DECIMALS);

      // Calculate minimum ADA required in output
      const minAdaFormatted = formatWithDecimals(
        minRecipientLovelace,
        CardanoConstants.ADA_DECIMALS
      );

      // Calculate total cost based on grossAmount flag
      let totalCostLovelace: bigint;
      let recipientReceivesAmount: number;

      if (grossAmount) {
        totalCostLovelace = BigInt(minRecipientLovelace);
        recipientReceivesAmount = requiredTokenAmount;
      } else {
        totalCostLovelace = BigInt(minRecipientLovelace) + feeLovelace;
        recipientReceivesAmount = requiredTokenAmount;
      }

      const totalCostFormatted = formatWithDecimals(
        Number(totalCostLovelace),
        CardanoConstants.ADA_DECIMALS
      );

      this.logger.info(
        `Fee estimation complete: ${feeFormatted.value} ADA, min ADA: ${minAdaFormatted.value} ADA, total cost: ${totalCostFormatted.value} ADA`
      );

      return {
        fee: {
          ada: feeFormatted.value,
          lovelace: feeLovelace.toString(),
        },
        minAdaRequired: {
          ada: minAdaFormatted.value,
          lovelace: minRecipientLovelace.toString(),
        },
        totalCost: {
          ada: totalCostFormatted.value,
          lovelace: totalCostLovelace.toString(),
        },
        recipientReceives: {
          amount: recipientReceivesAmount.toString(),
          ada: minAdaFormatted.value,
        },
      };
    } catch (error) {
      this.logAndRethrow("FeeEstimation", error);
    }
  };

  public transfer = async (
    options: CntTransferOpts
  ): Promise<{
    txHash: string;
    senderAddress: string;
    tokenPolicyId: string;
    tokenName: string;
    amount: number;
    fee: {
      lovelace: string;
      ada: string;
    };
  }> => {
    const { recipientVaultAccountId, tokenPolicyId, tokenName, requiredTokenAmount } = options;

    try {
      // Log transfer initiation
      if (recipientVaultAccountId) {
        this.logger.info(
          `Initiating vault-to-vault transfer: ${requiredTokenAmount} ${tokenName} from vault ${this.vaultAccountId} to vault ${recipientVaultAccountId}`
        );
      } else {
        this.logger.info(
          `Initiating transfer: ${requiredTokenAmount} ${tokenName} to ${options.recipientAddress}`
        );
      }

      // Prepare and validate transaction (reuses shared logic)
      const { txBody, senderAddress, resolvedRecipientAddress } =
        await this.prepareTransaction(options);

      // Extract fee information from transaction body
      const feeLovelace = txBody.fee().to_str();
      const feeFormatted = formatWithDecimals(parseInt(feeLovelace), CardanoConstants.ADA_DECIMALS);

      this.logger.info(
        `Transaction prepared, recipient: ${resolvedRecipientAddress}, fee: ${feeFormatted.value} ADA`
      );

      // Sign transaction with Fireblocks
      const signedTransaction = await this.signTransaction(txBody);

      // Submit transaction to blockchain
      const txHash = await submitTransaction(this.iagonApiService, signedTransaction);

      this.logger.info(`Transfer successful: ${txHash} (fee: ${feeFormatted.value} ADA)`);

      return {
        txHash,
        senderAddress,
        tokenPolicyId,
        tokenName,
        amount: requiredTokenAmount,
        fee: {
          lovelace: feeLovelace,
          ada: feeFormatted.value,
        },
      };
    } catch (error) {
      this.logAndRethrow("Transfer", error);
    }
  };

  /**
   * Shared preparation logic for native ADA transfers.
   * Validates inputs, selects UTxOs (preferring ADA-only), and builds the transaction body.
   * Called by both transferAda() and estimateAdaTransactionFee().
   */
  private async prepareAdaTransaction(params: AdaTransferOpts): Promise<{
    txBody: TransactionBody;
    senderAddress: string;
    resolvedRecipientAddress: string;
    fee: number;
    changeTokenAssets: Record<string, number>;
  }> {
    const {
      index = 0,
      recipientAddress,
      recipientVaultAccountId,
      recipientIndex = 0,
      lovelaceAmount,
    } = params;

    // Validate amount
    if (!Number.isInteger(lovelaceAmount) || lovelaceAmount <= 0) {
      throw new SdkApiError(
        "lovelaceAmount must be a positive integer",
        400,
        "ValidationError",
        { lovelaceAmount },
        "FireblocksCardanoRawSDK"
      );
    }
    if (lovelaceAmount < CardanoAmounts.MIN_UTXO_BASE_LOVELACE) {
      throw new SdkApiError(
        `lovelaceAmount ${lovelaceAmount} is below the Cardano protocol minimum of ${CardanoAmounts.MIN_UTXO_BASE_LOVELACE} lovelace (1 ADA)`,
        400,
        "BelowMinimumUtxo",
        { lovelaceAmount, minimum: CardanoAmounts.MIN_UTXO_BASE_LOVELACE },
        "FireblocksCardanoRawSDK"
      );
    }

    const resolvedRecipientAddress = await this.resolveRecipientAddress(
      recipientAddress,
      recipientVaultAccountId,
      recipientIndex
    );

    const senderAddress = await this.getAddressByIndex(this.assetId, index);

    // Select UTxOs — prefer ADA-only, fall back to multi-asset if needed
    const { selectedUtxos, accumulatedAda, changeTokenAssets, minChangeLovelace } =
      await fetchAndSelectUtxosForAda({
        iagonApiService: this.iagonApiService,
        address: senderAddress,
        lovelaceAmount,
        transactionFee: CardanoAmounts.ESTIMATED_MAX_FEE,
      });

    // Conservative balance check before building
    const minimumRequired = lovelaceAmount + CardanoAmounts.ESTIMATED_MAX_FEE + minChangeLovelace;
    if (accumulatedAda < minimumRequired) {
      const required = formatWithDecimals(minimumRequired, CardanoConstants.ADA_DECIMALS);
      const have = formatWithDecimals(accumulatedAda, CardanoConstants.ADA_DECIMALS);
      const short = formatWithDecimals(
        minimumRequired - accumulatedAda,
        CardanoConstants.ADA_DECIMALS
      );
      throw new SdkApiError(
        `Insufficient ADA: need ${required.value} ADA, have ${have.value} ADA (short ${short.value} ADA)`,
        400,
        "InsufficientBalance",
        {
          requiredLovelace: minimumRequired,
          accumulatedLovelace: accumulatedAda,
          breakdown: {
            lovelaceAmount,
            estimatedFee: CardanoAmounts.ESTIMATED_MAX_FEE,
            minChangeLovelace,
          },
        },
        "FireblocksCardanoRawSDK"
      );
    }

    const numTokenPolicies = countDistinctPolicies(changeTokenAssets);
    if (numTokenPolicies > 0) {
      this.logger.warn(
        `ADA transfer: selected UTxOs contain tokens (${numTokenPolicies} policies). All tokens will be returned to sender in change output.`
      );
    }

    // Build transaction with converging fee
    const txInputs = createTransactionInputs(selectedUtxos);
    const ttl = await this.fetchCurrentTtl();

    const { txBody, fee } = buildAdaTransactionWithCalculatedFee(
      {
        lovelaceAmount,
        recipientAddress: Address.from_bech32(resolvedRecipientAddress),
        senderAddress: Address.from_bech32(senderAddress),
        selectedUtxos,
      },
      txInputs,
      ttl,
      WITNESS_COUNT_PAYMENT_KEY_ONLY
    );

    return { txBody, senderAddress, resolvedRecipientAddress, fee, changeTokenAssets };
  }

  /**
   * Estimates the fee for a native ADA transfer without signing or submitting.
   *
   * @param request - AdaFeeEstimationRequest
   * @returns AdaFeeEstimationResponse with fee breakdown; includes tokenChangeWarning when token UTxOs are consumed
   */
  public estimateAdaTransactionFee = async (
    request: AdaFeeEstimationRequest
  ): Promise<AdaFeeEstimationResponse> => {
    const { lovelaceAmount, grossAmount = false } = request;

    try {
      this.logger.info(
        `Estimating ADA transaction fee for ${lovelaceAmount} lovelace (grossAmount: ${grossAmount})`
      );

      const { fee, changeTokenAssets } = await this.prepareAdaTransaction(request);

      const feeFormatted = formatWithDecimals(fee, CardanoConstants.ADA_DECIMALS);

      const recipientReceivesLovelace = grossAmount ? lovelaceAmount - fee : lovelaceAmount;
      const totalCostLovelace = grossAmount ? lovelaceAmount : lovelaceAmount + fee;

      const recipientFormatted = formatWithDecimals(
        recipientReceivesLovelace,
        CardanoConstants.ADA_DECIMALS
      );
      const totalCostFormatted = formatWithDecimals(
        totalCostLovelace,
        CardanoConstants.ADA_DECIMALS
      );

      const response: AdaFeeEstimationResponse = {
        fee: { ada: feeFormatted.value, lovelace: fee.toString() },
        recipientReceives: {
          ada: recipientFormatted.value,
          lovelace: recipientReceivesLovelace.toString(),
        },
        totalCost: { ada: totalCostFormatted.value, lovelace: totalCostLovelace.toString() },
      };

      const numPolicies = countDistinctPolicies(changeTokenAssets);
      if (numPolicies > 0) {
        response.tokenChangeWarning = {
          policiesAffected: numPolicies,
          message: `This transfer will consume UTxOs containing native tokens (${numPolicies} distinct token ${numPolicies === 1 ? "policy" : "policies"}). All tokens will be returned to your address in the change output.`,
        };
      }

      return response;
    } catch (error) {
      this.logAndRethrow("AdaFeeEstimation", error);
    }
  };

  /**
   * Transfers native ADA (lovelace) to a recipient address or vault.
   *
   * UTxO selection prefers ADA-only UTxOs. If multi-asset UTxOs must be spent,
   * all their tokens are returned to the sender in the change output — no tokens are lost.
   *
   * @param options - AdaTransferOpts (lovelaceAmount + recipient)
   * @returns AdaTransferResult including txHash, fee, and optional tokensPresentedInChange
   */
  public transferAda = async (options: AdaTransferOpts): Promise<AdaTransferResult> => {
    try {
      const {
        index = 0,
        recipientAddress,
        recipientVaultAccountId,
        recipientIndex = 0,
        lovelaceAmount,
      } = options;

      this.logger.info(
        `Initiating ADA transfer: ${lovelaceAmount} lovelace to ${recipientAddress ?? `vault ${recipientVaultAccountId}`}`
      );

      const senderAddress = await this.getAddressByIndex(this.assetId, index);
      const resolvedRecipientAddress = await this.resolveRecipientAddress(
        recipientAddress,
        recipientVaultAccountId,
        recipientIndex
      );

      const amount = formatWithDecimals(lovelaceAmount, CardanoConstants.ADA_DECIMALS).value;

      const { txHash, networkFee } = await this.fireblocksService.createTransfer({
        assetId: this.assetId,
        sourceVaultAccountId: this.vaultAccountId,
        amount,
        recipientAddress: recipientVaultAccountId ? undefined : resolvedRecipientAddress,
        recipientVaultAccountId,
      });

      // networkFee is returned as a decimal ADA string (e.g. "0.178701") — convert to lovelace
      const networkFeeLovelace = networkFee
        ? Math.round(parseFloat(networkFee) * Math.pow(10, CardanoConstants.ADA_DECIMALS))
        : undefined;
      const feeFormatted = networkFeeLovelace
        ? formatWithDecimals(networkFeeLovelace, CardanoConstants.ADA_DECIMALS)
        : { value: "unknown" };

      this.logger.info(`ADA transfer successful: ${txHash} (fee: ${feeFormatted.value} ADA)`);

      return {
        txHash,
        senderAddress,
        recipientAddress: resolvedRecipientAddress,
        lovelaceAmount,
        fee: {
          lovelace: networkFeeLovelace?.toString() ?? "unknown",
          ada: feeFormatted.value,
        },
      };
    } catch (error) {
      this.logAndRethrow("AdaTransfer", error);
    }
  };

  // ─── Multi-token transfer ────────────────────────────────────────────────────

  /**
   * Shared preparation logic for multi-token transfers.
   * Validates inputs, selects UTxOs, and builds the transaction body.
   */
  private async prepareMultiTokenTransaction(params: MultiTokenTransferOpts): Promise<{
    txBody: TransactionBody;
    senderAddress: string;
    resolvedRecipientAddress: string;
    fee: number;
    changeTokenAssets: Record<string, number>;
    minRecipientLovelace: number;
  }> {
    const {
      index = 0,
      recipientAddress,
      recipientVaultAccountId,
      recipientIndex = 0,
      tokens,
      lovelaceAmount,
    } = params;

    if (lovelaceAmount !== undefined && lovelaceAmount < CardanoAmounts.MIN_UTXO_BASE_LOVELACE) {
      throw new SdkApiError(
        `lovelaceAmount ${lovelaceAmount} is below the Cardano protocol minimum of ${CardanoAmounts.MIN_UTXO_BASE_LOVELACE} lovelace (1 ADA)`,
        400,
        "BelowMinimumUtxo",
        { lovelaceAmount, minimum: CardanoAmounts.MIN_UTXO_BASE_LOVELACE },
        "FireblocksCardanoRawSDK"
      );
    }

    if (!tokens || tokens.length === 0) {
      throw new SdkApiError(
        "At least one token must be specified in the tokens array",
        400,
        "ValidationError",
        { tokens },
        "FireblocksCardanoRawSDK"
      );
    }
    for (const t of tokens) {
      if (!Number.isInteger(t.amount) || t.amount <= 0) {
        throw new SdkApiError(
          `Token amount must be a positive integer (got ${t.amount} for ${t.tokenPolicyId}.${t.tokenName})`,
          400,
          "ValidationError",
          { token: t },
          "FireblocksCardanoRawSDK"
        );
      }
    }

    const resolvedRecipientAddress = await this.resolveRecipientAddress(
      recipientAddress,
      recipientVaultAccountId,
      recipientIndex
    );

    const senderAddress = await this.getAddressByIndex(this.assetId, index);

    const { selectedUtxos, accumulatedAda, changeTokenAssets, minChangeLovelace } =
      await fetchAndSelectUtxosForMultiToken({
        iagonApiService: this.iagonApiService,
        address: senderAddress,
        tokens,
        transactionFee: CardanoAmounts.ESTIMATED_MAX_FEE,
        lovelaceAmount,
      });

    // Conservative balance check before building
    const recipientPolicies = new Set(tokens.map((t) => t.tokenPolicyId)).size;
    const estimatedMinRecipient =
      lovelaceAmount ??
      CardanoAmounts.MIN_UTXO_BASE_LOVELACE +
        recipientPolicies * CardanoAmounts.MIN_UTXO_PER_POLICY_LOVELACE;
    const minimumRequired =
      estimatedMinRecipient + CardanoAmounts.ESTIMATED_MAX_FEE + minChangeLovelace;
    if (accumulatedAda < minimumRequired) {
      const required = formatWithDecimals(minimumRequired, CardanoConstants.ADA_DECIMALS);
      const have = formatWithDecimals(accumulatedAda, CardanoConstants.ADA_DECIMALS);
      throw new SdkApiError(
        `Insufficient ADA: need ${required.value} ADA (fee + min outputs), have ${have.value} ADA`,
        400,
        "InsufficientBalance",
        { requiredLovelace: minimumRequired, accumulatedLovelace: accumulatedAda },
        "FireblocksCardanoRawSDK"
      );
    }

    const numTokenPolicies = countDistinctPolicies(changeTokenAssets);
    if (numTokenPolicies > tokens.length) {
      this.logger.warn(
        `Multi-token transfer: selected UTxOs contain additional tokens (${numTokenPolicies} total policies). Extra tokens returned to sender in change.`
      );
    }

    const txInputs = createTransactionInputs(selectedUtxos);
    const ttl = await this.fetchCurrentTtl();

    const { txBody, fee } = buildMultiTokenTransactionWithCalculatedFee(
      {
        tokens,
        recipientAddress: Address.from_bech32(resolvedRecipientAddress),
        senderAddress: Address.from_bech32(senderAddress),
        selectedUtxos,
        minRecipientLovelace: lovelaceAmount,
      },
      txInputs,
      ttl,
      WITNESS_COUNT_PAYMENT_KEY_ONLY
    );

    return {
      txBody,
      senderAddress,
      resolvedRecipientAddress,
      fee,
      changeTokenAssets,
      minRecipientLovelace: estimatedMinRecipient,
    };
  }

  /**
   * Estimates the fee for a multi-token transfer without signing or submitting.
   *
   * @param request - MultiTokenFeeEstimationRequest
   * @returns MultiTokenFeeEstimationResponse with fee, minAdaRequired, totalCost,
   *          and optional tokenChangeWarning when extra-token UTxOs are consumed
   */
  public estimateMultiTokenTransactionFee = async (
    request: MultiTokenFeeEstimationRequest
  ): Promise<MultiTokenFeeEstimationResponse> => {
    const { grossAmount = false } = request;

    try {
      this.logger.info(`Estimating multi-token fee for ${request.tokens.length} token type(s)`);

      const { txBody, minRecipientLovelace, changeTokenAssets } =
        await this.prepareMultiTokenTransaction(request);

      const feeLovelace = parseInt(txBody.fee().to_str());
      const feeFormatted = formatWithDecimals(feeLovelace, CardanoConstants.ADA_DECIMALS);
      const minAdaFormatted = formatWithDecimals(
        minRecipientLovelace,
        CardanoConstants.ADA_DECIMALS
      );

      const totalCostLovelace = grossAmount
        ? minRecipientLovelace
        : minRecipientLovelace + feeLovelace;
      const totalCostFormatted = formatWithDecimals(
        totalCostLovelace,
        CardanoConstants.ADA_DECIMALS
      );

      const response: MultiTokenFeeEstimationResponse = {
        fee: { ada: feeFormatted.value, lovelace: feeLovelace.toString() },
        minAdaRequired: { ada: minAdaFormatted.value, lovelace: minRecipientLovelace.toString() },
        totalCost: { ada: totalCostFormatted.value, lovelace: totalCostLovelace.toString() },
      };

      const numPolicies = countDistinctPolicies(changeTokenAssets);
      if (numPolicies > request.tokens.length) {
        response.tokenChangeWarning = {
          policiesAffected: numPolicies - request.tokens.length,
          message: `Selected UTxOs carry additional tokens not included in this transfer. They will be returned to your address in the change output.`,
        };
      }

      return response;
    } catch (error) {
      this.logAndRethrow("MultiTokenFeeEstimation", error);
    }
  };

  /**
   * Transfers multiple CNTs to a recipient in a single Cardano transaction.
   *
   * All specified tokens are bundled into one recipient output. Any tokens present
   * in consumed UTxOs but not listed in `tokens` are returned to the sender in the
   * change output — no tokens are lost.
   *
   * @param options - MultiTokenTransferOpts
   * @returns MultiTokenTransferResult with txHash, fee, and optional tokensPresentedInChange
   */
  public transferMultipleTokens = async (
    options: MultiTokenTransferOpts
  ): Promise<MultiTokenTransferResult> => {
    try {
      this.logger.info(
        `Initiating multi-token transfer: ${options.tokens.length} token type(s) to ${options.recipientAddress ?? `vault ${options.recipientVaultAccountId}`}`
      );

      const { txBody, senderAddress, resolvedRecipientAddress, fee, changeTokenAssets } =
        await this.prepareMultiTokenTransaction(options);

      const feeFormatted = formatWithDecimals(fee, CardanoConstants.ADA_DECIMALS);
      this.logger.info(
        `Multi-token transaction prepared, recipient: ${resolvedRecipientAddress}, fee: ${feeFormatted.value} ADA`
      );

      const signedTransaction = await this.signTransaction(txBody);
      const txHash = await submitTransaction(this.iagonApiService, signedTransaction);

      this.logger.info(
        `Multi-token transfer successful: ${txHash} (fee: ${feeFormatted.value} ADA)`
      );

      const result: MultiTokenTransferResult = {
        txHash,
        senderAddress,
        recipientAddress: resolvedRecipientAddress,
        tokens: options.tokens,
        fee: { lovelace: fee.toString(), ada: feeFormatted.value },
      };

      const sentPolicies = new Set(options.tokens.map((t) => t.tokenPolicyId));
      const extraPolicies = [
        ...new Set(Object.keys(changeTokenAssets).map((u) => u.split(".")[0])),
      ].filter((p) => !sentPolicies.has(p));

      if (extraPolicies.length > 0) {
        result.tokensPresentedInChange = extraPolicies;
        this.logger.warn(
          `Multi-token transfer consumed UTxOs with additional tokens. Extra policies in change: ${extraPolicies.join(", ")}`
        );
      }

      return result;
    } catch (error) {
      this.logAndRethrow("MultiTokenTransfer", error);
    }
  };

  // ─── UTxO consolidation ───────────────────────────────────────────────────────

  /**
   * Consolidates all UTxOs at the given address index into a single UTxO.
   *
   * All ADA and all native tokens are merged into one output back to the sender.
   * Useful for addressing UTxO fragmentation after many incoming transfers.
   *
   * @param opts - ConsolidateUtxosOpts (optional — defaults: index=0, minUtxoCount=2)
   * @returns ConsolidateUtxosResult with txHash, fee, UTxO count merged, and token policies
   * @throws SdkApiError (400) if the address has fewer UTxOs than minUtxoCount
   */
  public consolidateUtxos = async (
    opts: ConsolidateUtxosOpts = {}
  ): Promise<ConsolidateUtxosResult> => {
    const { index = 0, minUtxoCount = 2 } = opts;

    try {
      const senderAddress = await this.getAddressByIndex(this.assetId, index);
      this.logger.info(`Consolidating UTxOs at address index ${index}: ${senderAddress}`);

      const utxos = await fetchUtxos(this.iagonApiService, senderAddress);

      if (utxos.length < minUtxoCount) {
        throw new SdkApiError(
          `Address has ${utxos.length} UTxO(s), which is below the required minimum of ${minUtxoCount} for consolidation`,
          400,
          "InsufficientUtxos",
          { utxoCount: utxos.length, minUtxoCount, address: senderAddress },
          "FireblocksCardanoRawSDK"
        );
      }

      const txInputs = createTransactionInputs(utxos);
      const ttl = await this.fetchCurrentTtl();

      const { outputs, fee, txBody } = buildConsolidationTransactionWithCalculatedFee(
        { senderAddress: Address.from_bech32(senderAddress), selectedUtxos: utxos },
        txInputs,
        ttl,
        WITNESS_COUNT_PAYMENT_KEY_ONLY
      );

      const feeFormatted = formatWithDecimals(fee, CardanoConstants.ADA_DECIMALS);
      this.logger.info(
        `Consolidation prepared: ${utxos.length} UTxOs → 1, fee: ${feeFormatted.value} ADA`
      );

      const signedTransaction = await this.signTransaction(txBody);
      const txHash = await submitTransaction(this.iagonApiService, signedTransaction);
      this.logger.info(`UTxO consolidation successful: ${txHash}`);

      // Extract metadata from the single consolidated output
      const consolidatedOutput = outputs[0];
      const outputLovelace = consolidatedOutput.amount().coin().to_str();
      const multiAsset = consolidatedOutput.amount().multiasset();
      const tokenPolicies: string[] = [];
      if (multiAsset) {
        const keys = multiAsset.keys();
        for (let i = 0; i < keys.len(); i++) {
          tokenPolicies.push(Buffer.from(keys.get(i).to_bytes()).toString("hex"));
        }
      }

      return {
        txHash,
        address: senderAddress,
        utxosCombined: utxos.length,
        lovelace: outputLovelace,
        fee: { lovelace: fee.toString(), ada: feeFormatted.value },
        tokenPolicies,
      };
    } catch (error) {
      this.logAndRethrow("Consolidation", error);
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
    return await this.fireblocksService.getVaultAccountAddresses(this.vaultAccountId, this.assetId);
  };

  /**
   * Gets the JWKS endpoint URL based on Fireblocks environment
   * Defaults to US production if not specified
   */
  private getJwksEndpoint(environment: "US" | "EU" | "EU2" | "SANDBOX" = "US"): string {
    return FireblocksWebhookConstants.JWKS_ENDPOINTS[environment];
  }

  /**
   * Verifies webhook signature using JWKS (JSON Web Key Set) method
   * This is the new recommended method for webhook verification
   *
   * @param rawBody - The raw request body as Buffer
   * @param jwsSignature - The value from Fireblocks-Webhook-Signature header
   * @param environment - Fireblocks environment (US, EU, EU2, or SANDBOX)
   * @returns true if signature is valid, false otherwise
   */
  private async verifyWebhookJWKS(
    rawBody: Buffer,
    jwsSignature: string,
    environment: "US" | "EU" | "EU2" | "SANDBOX" = "US"
  ): Promise<boolean> {
    try {
      const jwksEndpoint = this.getJwksEndpoint(environment);

      // Get or create JWKS instance (cached per endpoint)
      let jwks = this.jwksCache.get(jwksEndpoint);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(jwksEndpoint));
        this.jwksCache.set(jwksEndpoint, jwks);
        this.logger.debug(`Created JWKS client for ${jwksEndpoint}`);
      }

      // Detached JWS format: "header..signature" (no payload in the middle)
      const [header, , sig] = jwsSignature.split(".");

      if (!header || !sig) {
        this.logger.warn("Invalid JWS signature format");
        return false;
      }

      // Reconstruct full JWS with payload
      const payload = Buffer.from(rawBody).toString("base64url");
      const fullJws = `${header}.${payload}.${sig}`;

      // jose extracts kid from header and fetches correct key from JWKS
      await compactVerify(fullJws, jwks);
      this.logger.info("JWKS webhook signature verification successful");
      return true;
    } catch (error: any) {
      this.logger.error("JWKS verification failed:", error.message);
      return false;
    }
  }

  /**
   * Verifies webhook signature using legacy RSA-SHA512 method
   * This method is being phased out in favor of JWKS
   *
   * @param rawBody - The raw request body as Buffer
   * @param signature - The value from Fireblocks-Signature header (base64 encoded)
   * @param environment - Fireblocks environment to determine which public key to use
   * @returns true if signature is valid, false otherwise
   */
  private verifyWebhookLegacy(
    rawBody: Buffer,
    signature: string,
    environment: "US" | "EU" | "EU2" | "SANDBOX" = "US"
  ): boolean {
    try {
      // Use US key for SANDBOX and US, EU key for EU and EU2
      const publicKey =
        environment === "EU" || environment === "EU2"
          ? FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.EU
          : environment === "SANDBOX"
            ? FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.SANDBOX
            : FireblocksWebhookConstants.LEGACY_PUBLIC_KEYS.US;

      const verifier = crypto.createVerify("RSA-SHA512");
      verifier.update(rawBody);
      const isValid = verifier.verify(publicKey, signature, "base64");

      if (isValid) {
        this.logger.info("Legacy webhook signature verification successful");
      } else {
        this.logger.warn("Legacy webhook signature verification failed");
      }

      return isValid;
    } catch (error: any) {
      this.logger.error("Legacy signature verification failed:", error.message);
      return false;
    }
  }

  /**
   * Verifies Fireblocks webhook authenticity using both JWKS and legacy methods
   *
   * @param rawBody - The raw request body as Buffer (before JSON parsing)
   * @param headers - Request headers object (case-insensitive)
   * @param environment - Fireblocks environment (US, EU, EU2, or SANDBOX). Defaults to US.
   * @returns true if webhook is authentic, false otherwise
   * @throws Error if verification fails critically
   */
  public async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    environment: "US" | "EU" | "EU2" | "SANDBOX" = "US"
  ): Promise<boolean> {
    // Normalize header keys to lowercase for case-insensitive lookup
    const normalizedHeaders: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    const jwksSignature =
      normalizedHeaders[FireblocksWebhookConstants.HEADERS.JWKS_SIGNATURE.toLowerCase()];
    const legacySignature =
      normalizedHeaders[FireblocksWebhookConstants.HEADERS.LEGACY_SIGNATURE.toLowerCase()];

    // Try JWKS verification first (preferred method)
    if (jwksSignature) {
      const jwksValid = await this.verifyWebhookJWKS(rawBody, jwksSignature, environment);
      if (jwksValid) {
        return true;
      }
      this.logger.warn("JWKS verification failed, trying legacy method");
    }

    // Fall back to legacy verification
    if (legacySignature) {
      const legacyValid = this.verifyWebhookLegacy(rawBody, legacySignature, environment);
      if (legacyValid) {
        return true;
      }
    }

    // No valid signature found
    if (!jwksSignature && !legacySignature) {
      this.logger.error("No webhook signature headers found");
    } else {
      this.logger.error("Webhook signature verification failed with all methods");
    }

    return false;
  }

  /**
   * Enriches a webhook payload with detailed Cardano transaction data
   *
   * Note: This method only handles enrichment. Webhook signature verification
   * should be performed separately using the verifyWebhook() method before calling this.
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
    // Create cache key from all parameters
    const cacheKey = `${this.assetId}-${change}-${addressIndex}`;
    const cachedPublicKey = this.publicKeys.get(cacheKey);

    if (cachedPublicKey) {
      this.logger.debug(`Using cached public key for ${cacheKey}`);
      return cachedPublicKey;
    }

    // Fetch from Fireblocks if not cached
    const publicKey = await this.fireblocksService.getAssetPublicKey(
      this.vaultAccountId,
      this.assetId,
      change,
      addressIndex
    );

    // Cache the public key
    this.publicKeys.set(cacheKey, publicKey);
    this.logger.debug(`Cached public key for ${cacheKey}`);

    return publicKey;
  };

  /**
   * Helper to batch fetch and enrich asset metadata
   * @param assetIds - Array of asset IDs (format: "policyId.assetName")
   * @param amounts - Map of assetId to amount (for formatting)
   * @returns Map of assetId to enriched metadata
   */
  private async enrichAssetMetadata(
    assetIds: string[],
    amounts: Map<string, string>
  ): Promise<Map<string, TokenMetadata>> {
    const metadataMap = new Map<string, TokenMetadata>();

    // Fetch all metadata in parallel
    const metadataPromises = assetIds.map(async (assetId) => {
      try {
        const [policyId, assetName] = assetId.split(".");
        if (!policyId || !assetName) {
          this.logger.warn(`Invalid assetId format: ${assetId}`);
          return null;
        }

        const assetInfo = await this.iagonApiService.getAssetInfo(policyId, assetName);
        const amount = amounts.get(assetId) || "0";
        const decimals = assetInfo.data.metadata?.decimals || 0;
        const amountNumber = Number(amount);
        const formatted = formatWithDecimals(amountNumber, decimals);

        const metadata: TokenMetadata = {
          name: assetInfo.data.metadata?.name || null,
          ticker: assetInfo.data.metadata?.ticker || null,
          decimals,
          formattedAmount: formatted.value,
          description: assetInfo.data.metadata?.description || null,
          fingerprint: assetInfo.data.fingerprint || null,
        };

        return { assetId, metadata };
      } catch (error: any) {
        this.logger.warn(`Failed to fetch metadata for ${assetId}: ${error.message}`);
        return null;
      }
    });

    const results = await Promise.all(metadataPromises);

    // Build metadata map
    for (const result of results) {
      if (result) {
        metadataMap.set(result.assetId, result.metadata);
      }
    }

    this.logger.debug(`Enriched metadata for ${metadataMap.size}/${assetIds.length} assets`);
    return metadataMap;
  }

  /**
   * Helper to transform Iagon balance responses to include metadata
   * @param response - Raw Iagon API response
   * @returns Enriched response with metadata
   */
  private async enrichIagonResponse(
    response: BalanceResponse | GroupedBalanceResponse
  ): Promise<any> {
    if (!response.success || !response.data) {
      return response;
    }

    const { data } = response;
    const assetIds: string[] = [];
    const amounts = new Map<string, string>();

    // Check if it's a GroupedBalanceResponse or BalanceResponse
    const isGrouped = Object.values(data.assets || {}).some((val) => typeof val === "object");

    if (isGrouped) {
      // GroupedBalanceResponse
      for (const [policyId, tokens] of Object.entries(data.assets || {})) {
        for (const [assetName, amount] of Object.entries(tokens as any)) {
          const assetId = `${policyId}.${assetName}`;
          assetIds.push(assetId);
          amounts.set(assetId, String(amount));
        }
      }
    } else {
      // BalanceResponse
      for (const [assetId, amount] of Object.entries(data.assets || {})) {
        assetIds.push(assetId);
        amounts.set(assetId, String(amount));
      }
    }

    // Fetch metadata for all assets
    const metadataMap = await this.enrichAssetMetadata(assetIds, amounts);

    // Build enriched response
    const enrichedAssets: any = {};

    if (isGrouped) {
      // GroupedBalanceResponse structure
      for (const [policyId, tokens] of Object.entries(data.assets || {})) {
        enrichedAssets[policyId] = {};
        for (const [assetName, amount] of Object.entries(tokens as any)) {
          const assetId = `${policyId}.${assetName}`;
          const metadata = metadataMap.get(assetId);
          enrichedAssets[policyId][assetName] = {
            amount,
            ...(metadata && { metadata }),
          };
        }
      }
    } else {
      // BalanceResponse structure
      for (const [assetId, amount] of Object.entries(data.assets || {})) {
        const metadata = metadataMap.get(assetId);
        enrichedAssets[assetId] = {
          amount,
          ...(metadata && { metadata }),
        };
      }
    }

    return {
      success: true,
      data: {
        lovelace: data.lovelace,
        assets: enrichedAssets,
      },
    };
  }

  /**
   * Helper to aggregate vault balances based on groupBy option
   */
  private async aggregateVaultBalance(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>,
    groupBy: GroupByOptions,
    includeMetadata: boolean
  ): Promise<VaultBalanceResponse> {
    if (groupBy === GroupByOptions.ADDRESS) {
      return this.aggregateByAddress(results, includeMetadata);
    } else if (groupBy === GroupByOptions.POLICY) {
      return this.aggregateByPolicy(results, includeMetadata);
    } else {
      return this.aggregateByToken(results, includeMetadata);
    }
  }

  /**
   * Aggregate balances by token (default view)
   */
  private async aggregateByToken(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>,
    includeMetadata: boolean
  ): Promise<VaultBalanceTokenResponse> {
    const tokenMap = new Map<string, bigint>();
    let totalLovelace = BigInt(0);

    for (const result of results) {
      if (!result.balance || !result.balance.success) continue;

      const bal = result.balance.data;
      if (!bal) continue;

      // Add ADA
      totalLovelace += BigInt(bal.lovelace || 0);

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

    // Enrich with metadata if requested
    if (includeMetadata && tokenMap.size > 0) {
      const assetIds = Array.from(tokenMap.keys());
      const amounts = new Map(
        Array.from(tokenMap.entries()).map(([id, amt]) => [id, amt.toString()])
      );
      const metadataMap = await this.enrichAssetMetadata(assetIds, amounts);

      // Attach metadata to tokens
      for (const token of tokens) {
        const metadata = metadataMap.get(token.assetId);
        if (metadata) {
          token.metadata = metadata;
        }
      }
    }

    return {
      balances: [{ assetId: "ADA", amount: totalLovelace.toString(), tokenName: "ADA" }, ...tokens],
    };
  }

  /**
   * Aggregate balances by address
   */
  private async aggregateByAddress(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>,
    includeMetadata: boolean
  ): Promise<VaultBalanceAddressResponse> {
    const addresses: VaultBalanceByAddress[] = [];
    let totalLovelace = BigInt(0);
    const totalTokenMap = new Map<string, bigint>();

    for (const result of results) {
      if (!result.balance || !result.balance.success) {
        addresses.push({
          address: result.address,
          index: result.index,
          lovelace: "0",
          tokens: [],
        });
        continue;
      }

      const bal = result.balance.data;
      if (!bal) {
        addresses.push({
          address: result.address,
          index: result.index,
          lovelace: "0",
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

      totalLovelace += addressAda;

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
        lovelace: addressAda.toString(),
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

    // Enrich with metadata if requested
    let metadataMap: Map<string, TokenMetadata> | null = null;
    if (includeMetadata && totalTokenMap.size > 0) {
      const assetIds = Array.from(totalTokenMap.keys());
      const amounts = new Map(
        Array.from(totalTokenMap.entries()).map(([id, amt]) => [id, amt.toString()])
      );
      metadataMap = await this.enrichAssetMetadata(assetIds, amounts);
    }

    // Attach metadata to tokens if available
    if (metadataMap) {
      // Attach to per-address tokens
      for (const addr of addresses) {
        for (const token of addr.tokens) {
          const metadata = metadataMap.get(token.assetId);
          if (metadata) {
            (token as any).metadata = metadata;
          }
        }
      }

      // Attach to total tokens
      for (const token of totalTokens) {
        const metadata = metadataMap.get(token.assetId);
        if (metadata) {
          (token as any).metadata = metadata;
        }
      }
    }

    return {
      addresses,
      totals: {
        lovelace: totalLovelace.toString(),
        tokens: totalTokens,
      },
    };
  }

  /**
   * Aggregate balances by policy
   */
  private async aggregateByPolicy(
    results: Array<{
      address: string;
      index: number;
      balance: BalanceResponse | GroupedBalanceResponse | null;
    }>,
    includeMetadata: boolean
  ): Promise<VaultBalancePolicyResponse> {
    const policyMap = new Map<string, Map<string, bigint>>();
    let totalLovelace = BigInt(0);

    for (const result of results) {
      if (!result.balance || !result.balance.success) continue;

      const balance = result.balance.data;
      if (!balance) continue;

      totalLovelace += BigInt(balance.lovelace || 0);

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

    // Enrich with metadata if requested
    if (includeMetadata && policyMap.size > 0) {
      // Build list of all assetIds
      const assetIds: string[] = [];
      const amounts = new Map<string, string>();

      for (const [policyId, tokens] of policyMap.entries()) {
        for (const [hexTokenName, amount] of tokens.entries()) {
          const assetId = `${policyId}.${hexTokenName}`;
          assetIds.push(assetId);
          amounts.set(assetId, amount.toString());
        }
      }

      const metadataMap = await this.enrichAssetMetadata(assetIds, amounts);

      // Attach metadata to tokens in balances
      for (const balance of balances) {
        for (const [hexTokenName, tokenData] of Object.entries(balance.tokens)) {
          const assetId = `${balance.policyId}.${hexTokenName}`;
          const metadata = metadataMap.get(assetId);
          if (metadata) {
            (tokenData as any).metadata = metadata;
          }
        }
      }
    }

    return {
      balances,
      totalLovelace: totalLovelace.toString(),
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

    const { vaultAccountId, poolId, fee = CardanoAmounts.STAKING_TX_FEE } = options;

    return await this.stakingService.delegateToPool({ vaultAccountId, poolId, fee });
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
    const { vaultAccountId, fee = CardanoAmounts.STAKING_TX_FEE } = options;

    return await this.stakingService.deregisterStakingCredential({ vaultAccountId, fee });
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
  public withdrawRewards = async (
    options: WithdrawRewardsOptions
  ): Promise<
    StakingTransactionResult & {
      rewardAmount?: number;
    }
  > => {
    this.logger.info(`Withdrawing rewards for vault account ${options.vaultAccountId}`);
    const { vaultAccountId, limit, fee = CardanoAmounts.STAKING_TX_FEE } = options;

    return await this.stakingService.withdrawRewards({ vaultAccountId, limit, fee });
  };

  public getStakeAccountInfo = async (
    vaultAccountId: string
  ): Promise<StakeAccountInfoResponse> => {
    this.logger.info(`Getting staking account info for vault account ${vaultAccountId}`);

    const stakeAddress = await this.stakingService.getStakeAddress(vaultAccountId);
    return await this.iagonApiService.getStakeAccountInfo(stakeAddress);
  };

  public getCurrentEpoch = async (): Promise<CurrentEpochResponse> => {
    return await this.iagonApiService.getCurrentEpoch();
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
  /**
   * Register the vault account as a DRep (Delegated Representative) on Cardano
   *
   * Submits a Conway-era `reg_drep_cert` certificate to register the vault's stake
   * credential as a DRep. This costs a 500 ADA deposit (refundable on deregistration).
   * An optional anchor can point to publicly accessible DRep metadata.
   *
   * @param options - DRep registration options
   * @returns Transaction result with hash, status, and the bech32 DRep ID
   *
   * @example
   * ```typescript
   * // Register without metadata anchor
   * const result = await sdk.registerAsDRep({ vaultAccountId: "0" });
   *
   * // Register with a metadata anchor
   * const result = await sdk.registerAsDRep({
   *   vaultAccountId: "0",
   *   anchor: {
   *     url: "https://example.com/drep-metadata.json",
   *     dataHash: "abc123...", // blake2b-256 hex hash of the JSON file
   *   },
   * });
   * console.log(`DRep registration TX: ${result.txHash}, DRep ID: ${result.drepId}`);
   * ```
   */
  public registerAsDRep = async (options: RegisterAsDRepOptions): Promise<RegisterAsDRepResult> => {
    this.logger.info(`Registering vault account ${options.vaultAccountId} as a DRep`);
    return await this.stakingService.registerAsDRep(options);
  };

  /**
   * Cast a governance vote as a DRep (Conway era)
   *
   * Submits a `voting_procedures` transaction allowing a registered DRep to vote
   * Yes, No, or Abstain on a governance action.
   *
   * @param options - Vote options including governance action ID and vote choice
   * @returns Transaction result with hash, status, and the vote cast
   *
   * @example
   * ```typescript
   * const result = await sdk.castGovernanceVote({
   *   vaultAccountId: "0",
   *   governanceActionId: {
   *     txHash: "abc123...", // TX hash of the governance action proposal
   *     index: 0,
   *   },
   *   vote: "yes",
   * });
   * console.log(`Vote TX: ${result.txHash}`);
   * ```
   */
  public castGovernanceVote = async (options: CastVoteOptions): Promise<CastVoteResult> => {
    this.logger.info(
      `Casting vote "${options.vote}" on governance action ${options.governanceActionId.txHash}#${options.governanceActionId.index}`
    );
    return await this.stakingService.castVote(options);
  };

  public delegateToDRep = async (
    options: DRepDelegationOptions
  ): Promise<StakingTransactionResult> => {
    this.logger.info(
      `Delegating to DRep (${options.drepAction}) for vault account ${options.vaultAccountId}`
    );

    const { vaultAccountId, drepAction, drepId, fee = CardanoAmounts.GOVERNANCE_TX_FEE } = options;

    return await this.stakingService.delegateToDRep({ vaultAccountId, drepAction, drepId, fee });
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
   * // Output: stake1u9r76...
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
   * Get asset information including metadata, decimals, and supply
   *
   * Retrieves detailed information about a Cardano native token including:
   * - Asset name (decoded from hex)
   * - Metadata (name, ticker, description, decimals, logo, etc.)
   * - Total supply and mint/burn counts
   * - Fingerprint for unique identification
   *
   * @param policyId - The policy ID of the asset (hex string)
   * @param assetName - The asset name in hex format
   * @returns Detailed asset information including metadata
   * @throws Error if asset info retrieval fails
   *
   * @example
   * ```typescript
   * const assetInfo = await sdk.getAssetInfo(
   *   "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a",
   *   "4e4654"
   * );
   * console.log("Token Name:", assetInfo.data.metadata?.name);
   * console.log("Decimals:", assetInfo.data.metadata?.decimals);
   * console.log("Total Supply:", assetInfo.data.total_supply);
   * ```
   */
  public async getAssetInfo(
    policyId: string,
    assetName: string,
    skipCache: boolean = false
  ): Promise<AssetInfoResponse> {
    this.logger.info(`Getting asset info for ${policyId}.${assetName}`);
    return await this.iagonApiService.getAssetInfo(policyId, assetName, skipCache);
  }

  /**
   * Get staking pool information by pool ID
   *
   * Returns live metrics including saturation, stake, delegator count, margin, and fixed cost.
   *
   * @param poolId - Pool ID in bech32 format (pool1...) or hex
   * @returns Pool information including saturation and financial metrics
   */
  public async getPoolInfo(poolId: string): Promise<PoolInfoResponse> {
    this.logger.info(`Getting pool info for ${poolId}`);
    return await this.iagonApiService.getPoolInfo(poolId);
  }

  /**
   * Get pool metadata (name, ticker, description, homepage)
   * @param poolId - Pool ID in bech32 format (pool1...) or hex
   */
  public async getPoolMetadata(poolId: string): Promise<PoolMetadataResponse> {
    this.logger.info(`Getting pool metadata for ${poolId}`);
    return await this.iagonApiService.getPoolMetadata(poolId);
  }

  /**
   * Get aggregate pool delegator count and total active stake
   * @param poolId - Pool ID in bech32 format (pool1...) or hex
   */
  public async getPoolDelegators(poolId: string): Promise<PoolDelegatorsResponse> {
    this.logger.info(`Getting pool delegators for ${poolId}`);
    return await this.iagonApiService.getPoolDelegators(poolId);
  }

  /**
   * Get paginated list of individual pool delegators
   * @param poolId - Pool ID in bech32 format (pool1...) or hex
   * @param limit - Maximum number of results (default: 100)
   * @param offset - Pagination offset (default: 0)
   */
  public async getPoolDelegatorsList(
    poolId: string,
    limit?: number,
    offset?: number
  ): Promise<PoolDelegatorsListResponse> {
    this.logger.info(`Getting pool delegators list for ${poolId}`);
    return await this.iagonApiService.getPoolDelegatorsList(poolId, limit, offset);
  }

  /**
   * Get pool block production statistics
   * @param poolId - Pool ID in bech32 format (pool1...) or hex
   */
  public async getPoolBlocks(poolId: string): Promise<PoolBlocksResponse> {
    this.logger.info(`Getting pool blocks for ${poolId}`);
    return await this.iagonApiService.getPoolBlocks(poolId);
  }

  /**
   * Clear asset info cache
   * @param policyId - Optional: Clear cache for specific policy ID only
   * @param assetName - Op
   * tional: Clear cache for specific asset only (requires policyId)
   * @example
   * ```typescript
   * // Clear entire cache
   * sdk.clearAssetInfoCache();
   *
   * // Clear all assets for a specific policy
   * sdk.clearAssetInfoCache("f0ff48bbb...");
   *
   * // Clear specific asset
   * sdk.clearAssetInfoCache("f0ff48bbb...", "4e4654");
   * ```
   */
  public clearAssetInfoCache(policyId?: string, assetName?: string): void {
    this.iagonApiService.clearAssetInfoCache(policyId, assetName);
  }

  /**
   * Get asset cache statistics
   * @returns Cache statistics including size, TTL, and entry details
   * @example
   * ```typescript
   * const stats = sdk.getAssetCacheStats();
   * console.log(`Cache size: ${stats.size}`);
   * console.log(`Cache TTL: ${stats.ttl}ms`);
   * stats.entries.forEach(entry => {
   *   console.log(`${entry.asset}: age ${entry.age}ms, expires in ${entry.expiresIn}ms`);
   * });
   * ```
   */
  public getAssetCacheStats() {
    return this.iagonApiService.getAssetCacheStats();
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
