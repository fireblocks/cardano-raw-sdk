import {
  TransactionRequest,
  VaultWalletAddress,
  Transaction,
  SignedMessageSignature,
} from "@fireblocks/ts-sdk";
import { TransactionType } from "./enums.js";

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

/**
 * Options for getting transaction history
 */
export interface GetTransactionsHistoryOpts {
  /** Optional: Filter by asset ID */
  assetId?: string;
  /** Optional: Limit number of results */
  limit?: number;
  /** Optional: Offset for pagination */
  offset?: number;
  /** Optional: Filter by transaction status */
  status?: string;
  /** Optional: Filter by start date (ISO 8601 format) */
  startDate?: string;
  /** Optional: Filter by end date (ISO 8601 format) */
  endDate?: string;
}

/**
 * Response from getting transaction history
 * Uses Fireblocks Transaction type from SDK
 */
export interface TransactionHistoryResponse {
  /** Array of transactions from Fireblocks */
  transactions: Transaction[];
  /** Total count of transactions matching the query */
  total: number;
  /** Whether there are more results available */
  hasMore: boolean;
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
      params: GetTransactionsHistoryOpts;
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
