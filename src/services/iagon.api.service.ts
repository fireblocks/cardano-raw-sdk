import axios from "axios";
import https from "https";
import { z } from "zod";
import { Logger, ErrorHandler, decodeAssetName } from "../utils/index.js";
import { iagonBaseUrl } from "../constants.js";

// Zod schemas for critical Iagon responses
const utxoDataSchema = z.object({
  transaction_id: z.string(),
  output_index: z.number(),
  address: z.string(),
  value: z.object({
    lovelace: z.number(),
    assets: z.record(z.string(), z.number()),
  }),
  datum_hash: z.string().nullable(),
  script_hash: z.string().nullable(),
  created_at: z.object({
    slot_no: z.number(),
    header_hash: z.string(),
  }),
});

const utxoResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(utxoDataSchema).optional(),
});

const balanceResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    lovelace: z.number(),
    assets: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.number())])),
  }),
});

const transferResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    txHash: z.string(),
  }),
  error: z.string().optional(),
});
import {
  BalanceResponse,
  getBalanceByAddressOpts,
  getBalanceByCredentialOpts,
  getBalanceByStakeKeyOpts,
  GroupedBalanceResponse,
  DetailedTxHistoryResponse,
  TransferResponse,
  UtxoIagonResponse,
  GetTransactionHistoryOpts,
  TransactionDetailsResponse,
  Networks,
  SdkApiError,
  StakeAccountRewardsResponse,
  StakeAccountInfoResponse,
  CurrentEpochResponse,
  PoolInfoResponse,
  PoolMetadataResponse,
  PoolDelegatorsResponse,
  PoolDelegatorsListResponse,
  PoolBlocksResponse,
  DelegationHistoryResponse,
  AccountAssetsResponse,
  RegistrationHistoryResponse,
  WithdrawalHistoryResponse,
  PaymentAddressesResponse,
  HealthStatusResponse,
  AssetInfoResponse,
} from "../types/index.js";

/**
 * Cached asset information with timestamp
 */
interface CachedAssetInfo {
  data: AssetInfoResponse;
  timestamp: number;
}

export class IagonApiService {
  private readonly logger = new Logger("services:iagon-api-service");
  private network: Networks;
  private readonly iagonBaseUrl = iagonBaseUrl;
  private readonly iagonApiKey: string;
  private readonly errorHandler = new ErrorHandler("iagon-api", this.logger);
  private readonly axiosInstance;

  // Asset metadata cache
  private assetInfoCache = new Map<string, CachedAssetInfo>();
  private readonly ASSET_CACHE_TTL: number;

  constructor(
    apiKey: string,
    network: Networks = Networks.MAINNET,
    assetCacheTTL: number = 1000 * 60 * 60 * 24, // Default: 24 hours
    disableSslVerification: boolean = false
  ) {
    // Validate API key is provided and not empty
    if (!apiKey || apiKey.trim() === "") {
      throw new Error(
        "IAGON_API_KEY is required. Please set the IAGON_API_KEY environment variable or pass a valid API key to the constructor. " +
          "Without a valid API key, all balance, history, and transfer operations will fail with 401 Unauthorized errors."
      );
    }

    // SECURITY: Prevent SSL verification disabling in production
    if (disableSslVerification) {
      const env = process.env.NODE_ENV || "production";

      if (env === "production") {
        throw new Error(
          "SSL verification cannot be disabled in production environment. " +
            "This is a critical security vulnerability that enables man-in-the-middle attacks."
        );
      }

      this.logger.warn(
        "⚠️  SSL VERIFICATION DISABLED - This should ONLY be used in development with self-signed certificates. " +
          "NEVER deploy to production with this setting."
      );
    }

    this.iagonApiKey = apiKey;
    this.network = network;
    this.ASSET_CACHE_TTL = assetCacheTTL;

    // Create axios instance with default headers
    this.axiosInstance = axios.create({
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${this.iagonApiKey}`,
        "Content-Type": "application/json",
      },
      ...(disableSslVerification && {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }),
    });
  }

  // validate response against schema, throw on mismatch
  private validateResponse<T>(data: unknown, schema: z.ZodSchema<T>, ctx: string): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid response from ${ctx}: ${issues}`);
    }
    return result.data;
  }

  // retry on network errors and 5xx, skip 4xx
  private async withRetry<T>(
    fn: () => Promise<T>,
    ctx: string,
    maxRetries = 2
  ): Promise<T> {
    let lastErr: unknown;
    const delays = [250, 750];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastErr = err;
        const status = (err as { response?: { status?: number } })?.response?.status;
        // don't retry client errors
        if (status && status >= 400 && status < 500) throw err;
        if (attempt < maxRetries) {
          const delay = delays[attempt] ?? 750;
          this.logger.warn(`${ctx} failed, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  public checkHealth = async (): Promise<HealthStatusResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/health`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      this.logger.error(`Iagon health check failed with status: ${response.status}`);
      return {
        success: false,
        data: {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error: unknown) {
      this.logger.error(`Iagon health check error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        data: {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
        },
      };
    }
  };

  public getUtxosByAddress = async (address: string): Promise<UtxoIagonResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/utxos/address/${encodeURIComponent(address)}`;
      return await this.withRetry(async () => {
        const response = await this.axiosInstance.get(url);
        if (response.status === 200) {
          return this.validateResponse(response.data, utxoResponseSchema, "getUtxosByAddress");
        }
        throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
      }, `getUtxosByAddress(${address})`);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching UTXOs for address ${address}`);
    }
  };

  public getUtxosByCredential = async (credential: string): Promise<UtxoIagonResponse[]> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/utxos/credential/${credential}`;
      const response = await this.axiosInstance.get(url);
      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching UTXOs for credential ${credential}`);
    }
  };

  public getUtxosByStakeKey = async (stakeKey: string): Promise<UtxoIagonResponse[]> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/utxos/stake/${stakeKey}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching UTXOs for stake key ${stakeKey}`);
    }
  };

  public getBalanceByAddress = async (
    params: getBalanceByAddressOpts
  ): Promise<BalanceResponse | GroupedBalanceResponse> => {
    const { address, groupByPolicy = false } = params;

    try {
      const url = `${this.iagonBaseUrl}/v1/assets/balance/address/${address}?groupByPolicy=${groupByPolicy}`;
      return await this.withRetry(async () => {
        const response = await this.axiosInstance.get(url);
        if (response.status === 200) {
          // validate structure, cast to correct type based on groupByPolicy
          this.validateResponse(response.data, balanceResponseSchema, "getBalanceByAddress");
          return response.data as BalanceResponse | GroupedBalanceResponse;
        }
        throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
      }, `getBalanceByAddress(${address})`);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching balance for address ${address}`);
    }
  };

  public getBalanceByCredential = async (
    params: getBalanceByCredentialOpts
  ): Promise<BalanceResponse | GroupedBalanceResponse> => {
    const { credential, groupByPolicy = false } = params;
    try {
      const url = `${this.iagonBaseUrl}/v1/assets/balance/credential/${credential}?groupByPolicy=${groupByPolicy}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching balance for credential ${credential}`
      );
    }
  };

  public getBalanceByStakeKey = async (
    params: getBalanceByStakeKeyOpts
  ): Promise<BalanceResponse | GroupedBalanceResponse> => {
    const { stakeKey, groupByPolicy = false } = params;
    try {
      const url = `${this.iagonBaseUrl}/v1/assets/balance/stake/${stakeKey}?groupByPolicy=${groupByPolicy}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching balance for stake key ${stakeKey}`);
    }
  };

  /**
   * Helper method to build query parameters for transaction history requests
   */
  private buildTransactionHistoryQueryParams(params: GetTransactionHistoryOpts): URLSearchParams {
    const { limit, offset, fromSlot } = params;
    const queryParams = new URLSearchParams();

    if (limit !== undefined) {
      queryParams.append("limit", limit.toString());
    }
    if (offset !== undefined) {
      queryParams.append("offset", offset.toString());
    }
    if (fromSlot !== undefined) {
      queryParams.append("fromSlot", fromSlot.toString());
    }

    return queryParams;
  }

  /**
   * Helper method to fetch transaction history from a specific endpoint
   */
  private async fetchTransactionHistory(
    endpoint: string,
    params: GetTransactionHistoryOpts,
    operationName: string
  ): Promise<DetailedTxHistoryResponse> {
    try {
      const { address } = params;
      const queryParams = this.buildTransactionHistoryQueryParams(params);
      const queryString = queryParams.toString();
      const url = `${this.iagonBaseUrl}${endpoint}${encodeURIComponent(address)}${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, operationName);
    }
  }

  public getTransactionDetails = async (
    hash: string
  ): Promise<TransactionDetailsResponse | null> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/tx/hash/${encodeURIComponent(hash)}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching transaction ${hash} details`);
    }
  };

  public getTransactionHistory = async (
    params: GetTransactionHistoryOpts
  ): Promise<DetailedTxHistoryResponse> => {
    const endpoint = "/v1/tx/history/";
    return this.fetchTransactionHistory(endpoint, params, "fetching transactions history");
  };

  public getDetailedTxHistory = async (
    params: GetTransactionHistoryOpts
  ): Promise<DetailedTxHistoryResponse> => {
    const endpoint = "/v1/tx/address/";
    return this.fetchTransactionHistory(endpoint, params, "fetching detailed transactions history");
  };

  public submitTransfer = async (
    tx: string,
    skipValidation: boolean = false
  ): Promise<TransferResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/tx/submit`;

      const txData = { tx, skipValidation };

      const response = await this.axiosInstance.post(url, txData);

      if (response.status === 200) {
        return this.validateResponse(response.data, transferResponseSchema, "submitTransfer");
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `submitting transfer`);
    }
  };

  /**
   * Get staking rewards for a stake address
   */
  public getStakeAccountRewards = async (
    stakeAddress: string,
    offset: number = 0,
    limit: number = 100,
    order: "asc" | "desc" = "asc"
  ): Promise<StakeAccountRewardsResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/accounts/${encodeURIComponent(stakeAddress)}/rewards?offset=${offset}&limit=${limit}&order=${order}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching rewards for stake address ${stakeAddress}`
      );
    }
  };

  /**
   * Get stake account information
   */
  public getStakeAccountInfo = async (stakeAddress: string): Promise<StakeAccountInfoResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/accounts/${encodeURIComponent(stakeAddress)}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching info for stake address ${stakeAddress}`
      );
    }
  };

  /**
   * Get current epoch and slot information
   */
  public getCurrentEpoch = async (): Promise<CurrentEpochResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/epochs/latest`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching current epoch`);
    }
  };

  /**
   * Get pool information by pool ID
   */
  public getPoolInfo = async (poolId: string): Promise<PoolInfoResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/pools/${encodeURIComponent(poolId)}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching pool info for ${poolId}`);
    }
  };

  /**
   * Get pool metadata (name, ticker, description, homepage)
   */
  public getPoolMetadata = async (poolId: string): Promise<PoolMetadataResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/pools/${encodeURIComponent(poolId)}/metadata`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching pool metadata for ${poolId}`);
    }
  };

  /**
   * Get pool delegator count and total active stake
   */
  public getPoolDelegators = async (poolId: string): Promise<PoolDelegatorsResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/pools/${encodeURIComponent(poolId)}/delegators`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching pool delegators for ${poolId}`);
    }
  };

  /**
   * Get paginated list of individual pool delegators
   */
  public getPoolDelegatorsList = async (
    poolId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<PoolDelegatorsListResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/pools/${encodeURIComponent(poolId)}/delegators/list?limit=${limit}&offset=${offset}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching pool delegators list for ${poolId}`);
    }
  };

  /**
   * Get pool block production statistics
   */
  public getPoolBlocks = async (poolId: string): Promise<PoolBlocksResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/pools/${encodeURIComponent(poolId)}/blocks`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching pool blocks for ${poolId}`);
    }
  };

  public getDelegationHistory = async (
    stakeAddress: string,
    offset: number = 0,
    limit: number = 100,
    order: "asc" | "desc" = "asc"
  ): Promise<DelegationHistoryResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/accounts/${encodeURIComponent(stakeAddress)}/delegations?offset=${offset}&limit=${limit}&order=${order}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching delegation history for ${stakeAddress}`
      );
    }
  };

  public getWithdrawalHistory = async (
    stakeAddress: string,
    offset: number = 0,
    limit: number = 100,
    order: "asc" | "desc" = "asc"
  ): Promise<WithdrawalHistoryResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/accounts/${encodeURIComponent(stakeAddress)}/withdrawals?offset=${offset}&limit=${limit}&order=${order}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching withdrawal history for ${stakeAddress}`
      );
    }
  };

  public getPaymentAddresses = async (
    stakeAddress: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<PaymentAddressesResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/accounts/${encodeURIComponent(stakeAddress)}/addresses?offset=${offset}&limit=${limit}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching payment addresses for ${stakeAddress}`
      );
    }
  };

  /**
   * Assets on stake credential does not mean ownership of the assets.
   * It can be used for easier grouping of addresses/assets,
   * but ownership is defined by payment credential.
   */
  public getAccountAssets = async (stakeAddress: string): Promise<AccountAssetsResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/accounts/${encodeURIComponent(stakeAddress)}/assets`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(error, `fetching account assets for ${stakeAddress}`);
    }
  };

  public getRegistrationHistory = async (
    stakeAddress: string,
    limit: number = 100,
    offset: number = 0,
    order: "asc" | "desc" = "asc"
  ): Promise<RegistrationHistoryResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/accounts/${encodeURIComponent(stakeAddress)}/registrations?offset=${offset}&limit=${limit}&order=${order}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching registration history for ${stakeAddress}`
      );
    }
  };

  /**
   * Get asset information with caching
   * @param policyId - The policy ID of the asset
   * @param assetName - The asset name in hex format
   * @param skipCache - Optional: bypass cache and fetch fresh data
   * @returns Asset information including metadata
   */
  public getAssetInfo = async (
    policyId: string,
    assetName: string,
    skipCache: boolean = false
  ): Promise<AssetInfoResponse> => {
    try {
      const cacheKey = `${policyId}.${assetName}`;

      // Check cache first (unless skipCache is true)
      if (!skipCache) {
        const cached = this.assetInfoCache.get(cacheKey);
        if (cached) {
          const age = Date.now() - cached.timestamp;
          if (age < this.ASSET_CACHE_TTL) {
            this.logger.debug(
              `Asset info cache HIT for ${decodeAssetName(assetName)} (age: ${Math.round(age / 1000)}s)`
            );
            return cached.data;
          } else {
            // Cache expired, remove it
            this.assetInfoCache.delete(cacheKey);
            this.logger.debug(
              `Asset info cache EXPIRED for ${decodeAssetName(assetName)} (age: ${Math.round(age / 1000)}s)`
            );
          }
        }
      }

      // Cache miss or skipCache - fetch from API
      this.logger.debug(
        `Asset info cache MISS for ${decodeAssetName(assetName)}, fetching from API`
      );
      const url = `${this.iagonBaseUrl}/v1/assets/${cacheKey}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        const data: AssetInfoResponse = response.data;

        // Store in cache
        this.assetInfoCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        });

        this.logger.debug(
          `Asset info cached for ${decodeAssetName(assetName)} (cache size: ${this.assetInfoCache.size})`
        );

        return data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: unknown) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching asset info for ${decodeAssetName(assetName)} (${assetName}) with policy ${policyId}`
      );
    }
  };

  /**
   * Clear asset info cache
   * @param policyId - Optional: Clear cache for specific policy ID only
   * @param assetName - Optional: Clear cache for specific asset only (requires policyId)
   */
  public clearAssetInfoCache(policyId?: string, assetName?: string): void {
    if (policyId && assetName) {
      const cacheKey = `${policyId}.${assetName}`;
      this.assetInfoCache.delete(cacheKey);
      this.logger.info(`Cleared asset info cache for ${cacheKey}`);
    } else if (policyId) {
      // Clear all assets for this policy
      let count = 0;
      for (const key of this.assetInfoCache.keys()) {
        if (key.startsWith(policyId)) {
          this.assetInfoCache.delete(key);
          count++;
        }
      }
      this.logger.info(`Cleared ${count} cached assets for policy ${policyId}`);
    } else {
      // Clear entire cache
      const size = this.assetInfoCache.size;
      this.assetInfoCache.clear();
      this.logger.info(`Cleared entire asset info cache (${size} entries)`);
    }
  }

  /**
   * Get cache statistics
   */
  public getAssetCacheStats() {
    return {
      size: this.assetInfoCache.size,
      ttl: this.ASSET_CACHE_TTL,
      entries: Array.from(this.assetInfoCache.entries()).map(([key, value]) => ({
        asset: key,
        age: Date.now() - value.timestamp,
        expiresIn: Math.max(0, this.ASSET_CACHE_TTL - (Date.now() - value.timestamp)),
      })),
    };
  }
}
