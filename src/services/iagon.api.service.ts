import axios from "axios";
import { Logger, ErrorHandler } from "../utils/index.js";
import { iagonBaseUrl } from "../constants.js";
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
  DelegationHistoryResponse,
  AccountAssetsResponse,
  RegistrationHistoryResponse,
  WithdrawalHistoryResponse,
  PaymentAddressesResponse,
  HealthStatusResponse,
} from "../types/index.js";

export class IagonApiService {
  private readonly logger = new Logger("services:iagon-api-service");
  private network: Networks;
  private readonly iagonBaseUrl = iagonBaseUrl;
  private readonly iagonApiKey: string;
  private readonly errorHandler = new ErrorHandler("iagon-api", this.logger);
  private readonly axiosInstance;

  constructor(apiKey: string, network: Networks = Networks.MAINNET) {
    this.iagonApiKey = apiKey;
    this.network = network;

    // Create axios instance with default headers
    this.axiosInstance = axios.create({
      headers: {
        Authorization: `Bearer ${this.iagonApiKey}`,
        "Content-Type": "application/json",
      },
    });
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
    } catch (error: any) {
      this.logger.error(`Iagon health check error: ${error.message}`);
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
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching UTXOs for stake key ${stakeKey}`);
    }
  };

  public getBalanceByAddress = async (
    params: getBalanceByAddressOpts
  ): Promise<BalanceResponse | GroupedBalanceResponse> => {
    const { address, groupByPolicy = false } = params;

    console.log("IagonApiService: Fetching balance by address", this.iagonApiKey); //TODO: remove
    try {
      const url = `${this.iagonBaseUrl}/v1/assets/balance/address/${address}?groupByPolicy=${groupByPolicy}`;
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
      console.log("IagonApiService: Fetching current epoch", this.iagonApiKey); //TODO: remove
      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        return response.data;
      }
      throw new SdkApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
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
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching pool info for ${poolId}`);
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching registration history for ${stakeAddress}`
      );
    }
  };
}
