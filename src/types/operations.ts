import { TransactionRequest, VaultWalletAddress, SignedMessageSignature } from "@fireblocks/ts-sdk";
import { IagonApiService } from "../services/iagon.api.service.js";
import { TransactionType, TransactionHistoryResponse } from "./index.js";
import { TokenTransferSpec } from "./iagon/general.js";

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

export interface fetchAndSelectUtxosForCntParams {
  iagonApiService: IagonApiService;
  address: string;
  tokenPolicyId: string;
  requiredTokenAmount: number;
  transactionFee: number;
  tokenName: string;
}

export interface fetchAndSelectUtxosForAdaParams {
  iagonApiService: IagonApiService;
  address: string;
  /** Amount to send in lovelace */
  lovelaceAmount: number;
  /** Conservative fee upper bound for initial UTXO selection */
  transactionFee: number;
}

export interface fetchAndSelectUtxosForMultiTokenParams {
  iagonApiService: IagonApiService;
  address: string;
  tokens: TokenTransferSpec[];
  transactionFee: number;
  /** Optional explicit lovelace to send with tokens — used to set the ADA selection target */
  lovelaceAmount?: number;
}

/**
 * Result of a multi-token transfer
 */
export interface MultiTokenTransferResult {
  txHash: string;
  senderAddress: string;
  recipientAddress: string;
  /** Tokens that were sent to the recipient */
  tokens: TokenTransferSpec[];
  fee: { lovelace: string; ada: string };
  /** Policy IDs of tokens returned to sender in change (present only when extra token UTxOs were consumed) */
  tokensPresentedInChange?: string[];
}

/**
 * Request parameters for multi-token fee estimation
 */
export interface MultiTokenFeeEstimationRequest {
  index?: number;
  recipientAddress?: string;
  recipientVaultAccountId?: string;
  recipientIndex?: number;
  tokens: TokenTransferSpec[];
  minRecipientLovelace?: number;
  grossAmount?: boolean;
}

/**
 * Fee estimation response for multi-token transfers
 */
export interface MultiTokenFeeEstimationResponse {
  fee: { ada: string; lovelace: string };
  /** Minimum ADA required in the recipient output (based on token policy count) */
  minAdaRequired: { ada: string; lovelace: string };
  totalCost: { ada: string; lovelace: string };
  /** Present when token UTxOs carrying additional tokens are consumed */
  tokenChangeWarning?: { policiesAffected: number; message: string };
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

/**
 * Enriched token metadata from on-chain data
 */
export interface TokenMetadata {
  /** Official token name from metadata */
  name: string | null;
  /** Token ticker symbol */
  ticker: string | null;
  /** Number of decimal places */
  decimals: number;
  /** Human-readable formatted amount using decimals */
  formattedAmount: string;
  /** Token description */
  description: string | null;
  /** Asset fingerprint */
  fingerprint: string | null;
}

export interface VaultBalanceByToken {
  assetId: string;
  amount: string;
  tokenName?: string;
  /** Enriched metadata (when includeMetadata=true) */
  metadata?: TokenMetadata;
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
    /** Enriched metadata (when includeMetadata=true) */
    metadata?: TokenMetadata;
  }>;
}

export interface VaultBalanceByPolicy {
  policyId: string;
  tokens: {
    [hexTokenName: string]: {
      tokenName: string;
      amount: string;
      /** Enriched metadata (when includeMetadata=true) */
      metadata?: TokenMetadata;
    };
  };
}

export interface VaultBalanceSummary {
  /** Total balance in lovelace (1 ADA = 1,000,000 lovelace) */
  totalLovelace: string;
  tokens: Array<{
    assetId: string;
    amount: string;
    /** Enriched metadata (when includeMetadata=true) */
    metadata?: TokenMetadata;
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
      /** Enriched metadata (when includeMetadata=true) */
      metadata?: TokenMetadata;
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

/**
 * Request parameters for CNT fee estimation
 */
export interface CntFeeEstimationRequest {
  /** Recipient Cardano address */
  recipientAddress?: string;
  /** Recipient vault account ID (for vault-to-vault transfers) */
  recipientVaultAccountId?: string;
  /** Recipient address index (when using recipientVaultAccountId) */
  recipientIndex?: number;
  /** Source address index (defaults to 0) */
  index?: number;
  /** Token policy ID (hex format) */
  tokenPolicyId: string;
  /** Token name (hex format) */
  tokenName: string;
  /** Required token amount in base units */
  requiredTokenAmount: number;
  /** If true, fee is deducted from the amount being sent */
  grossAmount?: boolean;
}

/**
 * Request parameters for native ADA fee estimation
 */
export interface AdaFeeEstimationRequest {
  index?: number;
  recipientAddress?: string;
  recipientVaultAccountId?: string;
  recipientIndex?: number;
  /** Amount to estimate fee for, in lovelace (must be >= 1,000,000) */
  lovelaceAmount: number;
  /** If true, fee is considered included in lovelaceAmount (gross amount mode) */
  grossAmount?: boolean;
}

/**
 * Fee estimation response for native ADA transfers
 */
export interface AdaFeeEstimationResponse {
  fee: {
    ada: string;
    lovelace: string;
  };
  /** ADA recipient will actually receive */
  recipientReceives: {
    ada: string;
    lovelace: string;
  };
  totalCost: {
    ada: string;
    lovelace: string;
  };
  /**
   * Present when the UTXO selection consumed token UTxOs.
   * All those tokens are returned to the sender in the change output.
   */
  tokenChangeWarning?: {
    policiesAffected: number;
    message: string;
  };
}

/**
 * Result of a native ADA transfer
 */
export interface AdaTransferResult {
  txHash: string;
  senderAddress: string;
  recipientAddress: string;
  lovelaceAmount: number;
  fee: {
    lovelace: string;
    ada: string;
  };
  /**
   * Policy IDs of tokens that were returned to the sender in the change output.
   * Present only when token UTxOs were consumed to fund the transfer.
   */
  tokensPresentedInChange?: string[];
}

/**
 * Fee estimation response for CNT transfers
 */
export interface CntFeeEstimationResponse {
  /** Transaction fee details */
  fee: {
    /** Fee in ADA (human-readable) */
    ada: string;
    /** Fee in lovelace (base units) */
    lovelace: string;
  };
  /** Minimum ADA required in output UTXO for CNT transfers */
  minAdaRequired: {
    /** Minimum ADA in human-readable format */
    ada: string;
    /** Minimum ADA in lovelace */
    lovelace: string;
  };
  /** Total cost including fee */
  totalCost: {
    /** Total in ADA */
    ada: string;
    /** Total in lovelace */
    lovelace: string;
  };
  /** What the recipient will actually receive */
  recipientReceives: {
    /** Token amount recipient receives (in base units) */
    amount: string;
    /** ADA amount if applicable */
    ada: string;
  };
}
