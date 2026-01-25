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

export interface transferOpts {
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
