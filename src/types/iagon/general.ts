import { GroupByOptions } from "../index.js";

export interface getBalanceByAddressOpts {
  address: string;
  groupByPolicy: boolean;
}

export interface getBalanceByCredentialOpts {
  credential: string;
  groupByPolicy: boolean;
}

export interface getBalanceByStakeKeyOpts {
  stakeKey: string;
  groupByPolicy: boolean;
}

export interface getVaultBalanceOpts {
  groupBy?: GroupByOptions;
}

export interface CntTransferOpts {
  recipientAddress?: string;
  recipientVaultAccountId?: string;
  recipientIndex?: number;
  tokenPolicyId: string;
  tokenName: string;
  requiredTokenAmount: number;
  minRecipientLovelace?: number;
  minChangeLovelace?: number;
  index?: number;
}

/** A single token entry for multi-token transfers */
export interface TokenTransferSpec {
  /** Token policy ID (hex) */
  tokenPolicyId: string;
  /** Token name (hex) */
  tokenName: string;
  /** Amount to transfer in base units */
  amount: number;
}

export interface MultiTokenTransferOpts {
  index?: number;
  recipientAddress?: string;
  recipientVaultAccountId?: string;
  recipientIndex?: number;
  /** One or more tokens to send to the recipient in a single output */
  tokens: TokenTransferSpec[];
  /**
   * Explicit ADA amount (in lovelace) to include in the recipient output alongside the tokens.
   * Must be ≥ 1,000,000 lovelace (1 ADA) if provided. Defaults to the protocol minimum for the
   * number of token policies in the output.
   */
  lovelaceAmount?: number;
}

export interface ConsolidateUtxosOpts {
  /** Address index to consolidate (default: 0) */
  index?: number;
  /**
   * Minimum number of UTxOs required before consolidation proceeds.
   * Defaults to 2. Throws if the address has fewer UTxOs than this value.
   */
  minUtxoCount?: number;
}

export interface ConsolidateUtxosResult {
  txHash: string;
  address: string;
  /** Number of UTxOs merged into the single consolidated output */
  utxosCombined: number;
  /** Lovelace in the consolidated output (after fee) */
  lovelace: string;
  fee: { lovelace: string; ada: string };
  /** Distinct token policy IDs present in the consolidated output */
  tokenPolicies: string[];
}

export interface AdaTransferOpts {
  /** Source address index on the sending vault (default: 0) */
  index?: number;
  /** Recipient bech32 Cardano address (mutually exclusive with recipientVaultAccountId) */
  recipientAddress?: string;
  /** Recipient vault account ID (mutually exclusive with recipientAddress) */
  recipientVaultAccountId?: string;
  /** Address index on the recipient vault (default: 0) */
  recipientIndex?: number;
  /** Amount to send in lovelace (1 ADA = 1,000,000 lovelace) */
  lovelaceAmount: number;
}

export interface HealthStatusResponse {
  success: boolean;
  data: {
    status: "healthy" | string;
    timestamp: string;
  };
}
