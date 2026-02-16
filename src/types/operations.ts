import { TransactionRequest, VaultWalletAddress, SignedMessageSignature } from "@fireblocks/ts-sdk";
import { IagonApiService } from "../services/iagon.api.service.js";
import { TransactionType, TransactionHistoryResponse } from "./index.js";

/**
 * Options for getting a single vault account address by index
 */
export interface GetVaultAccountAddressOpts {
  /** The asset ID (e.g., 'BTC', 'ETH', 'ADA') */
  assetId: string;
  /** The address index (defaults to 0) */
  index?: number;
}

/**
 * Options for getting all vault account addresses for an asset
 */
export interface GetVaultAccountAddressesOpts {
  /** The asset ID (e.g., 'BTC', 'ETH', 'ADA') */
  assetId: string;
}

/**
 * Options for submitting a transaction through Fireblocks
 */
export interface SubmitTransactionOpts {
  /** The Fireblocks transaction request payload */
  transactionRequest: TransactionRequest;
  /** Whether to wait for transaction completion (defaults to true) */
  waitForCompletion?: boolean;
}

export interface GetTransactionHistoryOpts {
  /** address for which to fetch transaction history */
  address: string;
  /** Optional: Limit number of results */
  limit?: number;
  /** Optional: Offset for pagination */
  offset?: number;
  /** Optional: Start slot for filtering transactions */
  fromSlot?: number;
}

export interface fetchAndSelectUtxosParams {
  iagonApiService: IagonApiService;
  address: string;
  tokenPolicyId: string;
  requiredTokenAmount: number;
  transactionFee: number;
  tokenName: string;
}

/**
 * Discriminated union for type-safe operation requests
 *
 * This ensures that TypeScript knows exactly which params type to expect
 * for each operation type, eliminating the need for type casting.
 *
 * @example
 * ```typescript
 * const request: OperationRequest = {
 *   type: TransactionType.GET_VAULT_ACCOUNT_ADDRESS,
 *   params: { assetId: 'BTC', index: 0 } // ✓ TypeScript knows this is correct
 * };
 * ```
 */
export type OperationRequest =
  | {
      type: TransactionType.GET_BLALANCE_BY_ADDRESS;
      params: GetVaultAccountAddressOpts;
    }
  | {
      type: TransactionType.GET_BLALNCE_BY_CREDENTIAL_ID;
      params: GetVaultAccountAddressesOpts;
    }
  | {
      type: TransactionType.GET_BALANCE_BY_STAKE_KEY;
      params: SubmitTransactionOpts;
    }
  | {
      type: TransactionType.GET_TRANSACTIONS_HISTORY;
      params: GetTransactionHistoryOpts;
    }
  | {
      type: TransactionType.TRANSFER;
      params: SubmitTransactionOpts;
    };

/**
 * Result types for each operation (discriminated union)
 */
export type OperationResult =
  | {
      type: TransactionType.GET_BLALANCE_BY_ADDRESS;
      result: VaultWalletAddress;
    }
  | {
      type: TransactionType.GET_BLALNCE_BY_CREDENTIAL_ID;
      result: VaultWalletAddress[];
    }
  | {
      type: TransactionType.GET_BALANCE_BY_STAKE_KEY;
      result: {
        signature: SignedMessageSignature;
        content?: string;
        publicKey?: string;
        algorithm?: string;
      } | null;
    }
  | {
      type: TransactionType.GET_TRANSACTIONS_HISTORY;
      result: TransactionHistoryResponse;
    };

/**
 * Extract params type for a specific operation type
 */
export type ParamsForOperation<T extends TransactionType> = Extract<
  OperationRequest,
  { type: T }
>["params"];

/**
 * Extract result type for a specific operation type
 */
export type ResultForOperation<T extends TransactionType> = Extract<
  OperationResult,
  { type: T }
>["result"];

export interface VaultBalanceByToken {
  assetId: string;
  amount: string;
  tokenName?: string;
}

export interface VaultBalanceByAddress {
  address: string;
  index: number;
  /** Balance in lovelace (1 ADA = 1,000,000 lovelace) */
  lovelace: string;
  tokens: Array<{
    assetId: string;
    amount: string;
    tokenName?: string;
  }>;
}

export interface VaultBalanceByPolicy {
  policyId: string;
  tokens: {
    [hexTokenName: string]: {
      tokenName: string;
      amount: string;
    };
  };
}

export interface VaultBalanceSummary {
  /** Total balance in lovelace (1 ADA = 1,000,000 lovelace) */
  totalLovelace: string;
  tokens: Array<{
    assetId: string;
    amount: string;
  }>;
}

export interface VaultBalanceTokenResponse {
  balances: VaultBalanceByToken[];
}

export interface VaultBalanceAddressResponse {
  addresses: VaultBalanceByAddress[];
  totals: {
    /** Total balance in lovelace (1 ADA = 1,000,000 lovelace) */
    lovelace: string;
    tokens: Array<{
      assetId: string;
      amount: string;
      tokenName?: string;
    }>;
  };
}

export interface VaultBalancePolicyResponse {
  balances: VaultBalanceByPolicy[];
  /** Total balance in lovelace (1 ADA = 1,000,000 lovelace) */
  totalLovelace: string;
}

export type VaultBalanceResponse =
  | VaultBalanceSummary
  | VaultBalanceTokenResponse
  | VaultBalanceAddressResponse
  | VaultBalancePolicyResponse;
