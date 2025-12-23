import { Address } from "@emurgo/cardano-serialization-lib-nodejs";

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

export interface getTransactionsHistoryOpts {
  address: string;
  limit?: number;
  offset?: number;
  fromSlot?: number;
}

export interface transferOpts {
  vaultAccountId: string;
  recipientAddress: string;
  tokenPolicyId: string;
  tokenName: string;
  requiredTokenAmount: number;
  minRecipientLovelace?: number;
  minChangeLovelace?: number;
  index?: number;
}

export interface UtxoData {
  transaction_id: string;
  output_index: number;
  address: string;
  value: {
    lovelace: number;
    assets: {
      [key: string]: number;
    };
  };
  datum_hash: string | null;
  script_hash: string | null;
  created_at: {
    slot_no: number;
    header_hash: string;
  };
}

export interface UtxoIagonResponse {
  success: boolean;
  data?: UtxoData[];
}

export interface BalanceResponse {
  success: boolean;
  balance: {
    lovelace: number;
    assets: {
      [key: string]: number;
    };
  };
}

export interface GroupedBalanceResponse {
  success: boolean;
  balance: {
    lovelace: number;
    assets: {
      [policyId: string]: {
        [key: string]: number;
      };
    };
  };
}

export interface HistoryResponse {}

export interface TransferResponse {
  success: boolean;
  data: {
    txHash: string;
  };
}

export interface TransactionValue {
  lovelace: number;
  assets?: Record<string, number>;
}

export interface TransactionInput {
  tx_hash: string;
  output_index: number;
  address: string;
  value: TransactionValue;
}

export interface TransactionOutput {
  output_index: number;
  address: string;
  value: TransactionValue;
}

export interface Transaction {
  tx_hash: string;
  block_hash: string;
  slot_no: number;
  block_no: number;
  block_time: string;
  fee: number;
  size: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
}

export interface TransactionPagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  next_cursor?: number;
}

export interface LastUpdated {
  slot_no: number;
  block_hash: string;
  block_time: string;
}

export interface TransactionsHistoryResponse {
  success: boolean;
  data: Transaction[];
  pagination: TransactionPagination;
  last_updated: LastUpdated;
}

export interface createTransactionOutputsParams {
  requiredLovelace: number;
  fee: number;
  recipientAddress: Address;
  senderAddress: Address;
  tokenPolicyId: string;
  tokenName: string;
  transferAmount: number;
  selectedUtxos: UtxoData[];
}
