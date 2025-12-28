import { Address } from "@emurgo/cardano-serialization-lib-nodejs";
import { GroupByOptions } from "./enums.js";

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
  data: {
    lovelace: number;
    assets: {
      [key: string]: number;
    };
  };
}

export interface GroupedBalanceResponse {
  success: boolean;
  data: {
    lovelace: number;
    assets: {
      [policyId: string]: {
        [key: string]: number;
      };
    };
  };
}

export interface VaultBalanceByToken {
  assetId: string;
  amount: string;
  tokenName?: string;
}

export interface VaultBalanceByAddress {
  address: string;
  index: number;
  ada: string;
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
  totalAda: string;
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
    ada: string;
    tokens: Array<{
      assetId: string;
      amount: string;
      tokenName?: string;
    }>;
  };
}

export interface VaultBalancePolicyResponse {
  balances: VaultBalanceByPolicy[];
  totalAda: string;
}

export type VaultBalanceResponse =
  | VaultBalanceSummary
  | VaultBalanceTokenResponse
  | VaultBalanceAddressResponse
  | VaultBalancePolicyResponse;

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

export interface TransactionHistoryItem {
  tx_hash: string;
  block_hash: string;
  slot_no: number;
  block_no: number;
  block_time: string;
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

export interface TransactionDetailsResponse {
  success: boolean;
  data: DetailedTransaction;
}

export interface TransactionHistoryResponse {
  success: boolean;
  data: TransactionHistoryItem[];
  pagination: TransactionPagination;
  last_updated: LastUpdated;
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

export interface DetailedTxHistoryResponse {
  success: boolean;
  data: DetailedTransaction[];
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

/**
 * Staking-related Iagon API types
 */

export interface StakeAccountReward {
  epoch: number;
  amount: string;
  pool_id: string;
}

export interface StakeAccountWithdrawal {
  tx_hash: string;
  amount: string;
}

export interface StakeAccountInfo {
  stake_address: string;
  active: boolean;
  active_epoch: number | null;
  controlled_amount: string;
  rewards_sum: string;
  withdrawals_sum: string;
  reserves_sum: string;
  treasury_sum: string;
  withdrawable_amount: string;
  pool_id: string | null;
}

export interface StakeAccountRewardsResponse {
  success: boolean;
  data: {
    rewards: StakeAccountReward[];
    withdrawals: StakeAccountWithdrawal[];
    available_rewards: number;
    total_rewards: number;
    total_withdrawals: number;
  };
}

export interface StakeAccountInfoResponse {
  success: boolean;
  data: StakeAccountInfo;
}

export interface CurrentEpochResponse {
  success: boolean;
  data: {
    epoch: number;
    slot: number;
    block_no: number;
  };
}

export interface PoolInfoResponse {
  success: boolean;
  data: {
    pool_id: string;
    hex: string;
    vrf_key: string;
    blocks_minted: number;
    blocks_epoch: number;
    live_stake: string;
    live_size: number;
    live_saturation: number;
    live_delegators: number;
    active_stake: string;
    active_size: number;
    declared_pledge: string;
    live_pledge: string;
    margin_cost: number;
    fixed_cost: string;
    reward_account: string;
    owners: string[];
    registration: string[];
    retirement: string[];
  };
}
