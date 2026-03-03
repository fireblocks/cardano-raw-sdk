import { Address } from "@emurgo/cardano-serialization-lib-nodejs";
import { UtxoData } from "./UTXOs.js";
import { TokenTransferSpec } from "./general.js";

export interface LastUpdated {
  slot_no: number;
  block_hash: string;
  block_time: string;
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
export interface DetailedTransaction {
  tx_hash: string;
  block_hash: string;
  slot_no: number;
  block_no: number;
  block_time: string;
  fee: number;
  size: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  address?: string;
}

export interface TransactionPagination {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  next_cursor?: number;
}

export interface TransactionHistoryItem {
  tx_hash: string;
  block_hash: string;
  slot_no: number;
  block_no: number;
  block_time: string;
  address?: string;
}

export interface DetailedTxHistoryResponse {
  success: boolean;
  data: DetailedTransaction[];
  pagination: TransactionPagination;
  last_updated: LastUpdated;
}

export interface TransactionDetailsResponse {
  success: boolean;
  data: DetailedTransaction;
}

export interface CntTransactionOutputsParams {
  requiredLovelace: number;
  fee: number;
  recipientAddress: Address;
  senderAddress: Address;
  tokenPolicyId: string;
  tokenName: string;
  transferAmount: number;
  selectedUtxos: UtxoData[];
}

export interface MultiTokenTransactionOutputsParams {
  /** All tokens to send to the recipient in a single output */
  tokens: TokenTransferSpec[];
  fee: number;
  recipientAddress: Address;
  senderAddress: Address;
  selectedUtxos: UtxoData[];
  /** Explicit lovelace for recipient output; calculated from policy count if absent */
  minRecipientLovelace?: number;
}

export interface ConsolidationTransactionOutputParams {
  fee: number;
  senderAddress: Address;
  selectedUtxos: UtxoData[];
}

export interface TransactionHistoryResponse {
  success: boolean;
  data: TransactionHistoryItem[];
  pagination: TransactionPagination;
  last_updated: LastUpdated;
}

export interface GroupedTransactionHistoryResponse {
  success: boolean;
  data: Record<string, TransactionHistoryItem[]>;
  pagination: TransactionPagination;
  last_updated: LastUpdated;
}

export interface GroupedDetailedTxHistoryResponse {
  success: boolean;
  data: Record<string, DetailedTransaction[]>;
  pagination: TransactionPagination;
  last_updated: LastUpdated;
}

export interface TransferResponse {
  success: boolean;
  data: {
    txHash: string;
  };
  error?: string;
}
