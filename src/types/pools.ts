import { PoolStatus } from "./index.js";

export interface PoolInfo {
  pool_id: string;
  pool_id_hex: string;
  vrf_key_hash: string;
  pledge: string;
  margin: number;
  fixed_cost: string;
  reward_account: string | null;
  owners: string[];
  relays: [
    {
      ipv4: string;
      port: number;
    },
    {
      dns: string;
      port: number;
    },
  ];
  metadata_url: string | null;
  metadata_hash: string | null;
  active_stake: string;
  live_stake: string;
  delegator_count: number;
  blocks_minted: number;
  blocks_epoch: number;
  saturation: number;
  status: PoolStatus;
  retiring_epoch: number | null;
}

export interface PoolInfoResponse {
  success: boolean;
  data: PoolInfo;
}

export interface PoolMetadata {
  pool_id: string | null;
  name: string | null;
  ticker: string | null;
  description: string | null;
  homepage: string | null;
  extended: string | null;
}

export interface PoolMetadataResponse {
  success: boolean;
  data: PoolMetadata;
}

export interface PoolDelegatorsResponse {
  success: boolean;
  data: {
    pool_id: string;
    delegator_count: number;
    active_stake: string;
  };
}

type DelegatorListItem = {
  stake_address: string;
  amount: string;
  active_epoch_no: number;
};

export interface PoolDelegatorsListResponse {
  success: boolean;
  data: {
    pool_id: string;
    delegators: DelegatorListItem[];
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface PoolBlocksResponse {
  success: boolean;
  data: {
    pool_id: string;
    blocks_minted: number;
    blocks_epoch: number;
    current_epoch: number;
  };
}
