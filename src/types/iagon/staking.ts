/**
 * Staking-related Iagon API types
 */

import { RewardType, LastUpdated } from "../index.js";

export type Pagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
};

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
  active_stake: string;
  rewards_sum: string;
  withdrawn_rewards: string;
  available_rewards: string;
  pool_id: string | null;
  drep_id: string | null;
}

export interface StakeAccountRewardsResponse {
  success: boolean;
  data: {
    epoch: number;
    amount: string;
    pool_id: string;
    reward_type: RewardType;
  }[];
  pagination: Pagination;
  last_updated: LastUpdated;
}

export interface StakeAccountInfoResponse {
  success: boolean;
  data: StakeAccountInfo;
}

export interface RegistrationHistoryResponse {
  success: boolean;
  data: {
    tx_hash: string;
    action: "registered" | "deregistered";
    epoch: number;
  }[];
  pagination: Pagination;
  last_updated: LastUpdated;
}

export interface AccountAssetsResponse {
  success: boolean;
  data: {
    unit: string;
    quantity: string;
  }[];
  pagination: Pagination;
  last_updated: {
    slot_no: number;
    block_hash: string;
    block_time: string;
  };
}

export interface PaymentAddressesResponse {
  success: boolean;
  data: {
    address: string;
  }[];
  pagination: Pagination;
  last_updated: LastUpdated;
}

export interface WithdrawalHistoryResponse {
  success: boolean;
  data: {
    tx_hash: string;
    amount: string;
    block_time: string;
  }[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  last_updated: {
    slot_no: number;
    block_hash: string;
    block_time: string;
  };
}
