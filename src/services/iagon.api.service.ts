import axios from "axios";
import { Logger } from "../utils/logger.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { iagonBaseUrl } from "../constants.js";
import { IagonApiError } from "../types/errors.js";
import {
  BalanceResponse,
  getBalanceByAddressOpts,
  getBalanceByCredentialOpts,
  getBalanceByStakeKeyOpts,
  getDetailedTxHistoryOpts,
  GroupedBalanceResponse,
  DetailedTxHistoryResponse,
  TransferResponse,
  UtxoIagonResponse,
} from "../types/index.js";

export class IagonApiService {
  private readonly logger = new Logger("services:iagon-api-service");
  private readonly iagonBaseUrl = iagonBaseUrl;
  private readonly iagonApiKey: string | null = process.env.IAGON_API_KEY || null;
  private readonly errorHandler = new ErrorHandler("iagon-api", this.logger);

  public getUtxosByAddress = async (address: string): Promise<UtxoIagonResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/utxos/address/${encodeURIComponent(address)}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching UTXOs for address ${address}`);
    }
  };

  public getUtxosByCredential = async (credential: string): Promise<UtxoIagonResponse[]> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/utxos/credential/${credential}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });
      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching UTXOs for credential ${credential}`);
    }
  };

  public getUtxosByStakeKey = async (stakeKey: string): Promise<UtxoIagonResponse[]> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/utxos/stake/${stakeKey}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching UTXOs for stake key ${stakeKey}`);
    }
  };

  public getBalanceByAddress = async (
    params: getBalanceByAddressOpts
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { address, groupByPolicy = false } = params;

    try {
      const url = `${this.iagonBaseUrl}/v1/assets/balance/address/${address}?groupByPolicy=${groupByPolicy}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching balance for address ${address}`);
    }
  };

  public getBalanceByCredential = async (
    params: getBalanceByCredentialOpts
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { credential, groupByPolicy = false } = params;
    try {
      const url = `${this.iagonBaseUrl}/v1/assets/balance/credential/${credential}?groupByPolicy=${groupByPolicy}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(
        error,
        `fetching balance for credential ${credential}`
      );
    }
  };

  public getBalanceByStakeKey = async (
    params: getBalanceByStakeKeyOpts
  ): Promise<BalanceResponse[] | GroupedBalanceResponse[]> => {
    const { stakeKey, groupByPolicy = false } = params;
    try {
      const url = `${this.iagonBaseUrl}/v1/assets/balance/stake/${stakeKey}?groupByPolicy=${groupByPolicy}`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `fetching balance for stake key ${stakeKey}`);
    }
  };

  public getDetailedTxHistory = async (
    params: getDetailedTxHistoryOpts
  ): Promise<DetailedTxHistoryResponse> => {
    try {
      const { address, limit, offset, fromSlot } = params;
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

      const queryString = queryParams.toString();
      const url = `${this.iagonBaseUrl}/v1/tx/address/${encodeURIComponent(address)}${
        queryString ? `?${queryString}` : ""
      }`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, "fetching transactions history");
    }
  };

  public submitTransfer = async (
    tx: string,
    skipValidation: boolean = false
  ): Promise<TransferResponse> => {
    try {
      const url = `${this.iagonBaseUrl}/v1/tx/submit`;

      const txData = { tx, skipValidation };

      const response = await axios.post(url, txData, {
        headers: {
          Authorization: `Bearer ${this.iagonApiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        return response.data;
      }
      throw new IagonApiError(`Unexpected response status: ${response.status}`, response.status);
    } catch (error: any) {
      throw this.errorHandler.handleApiError(error, `submitting transfer`);
    }
  };
}
