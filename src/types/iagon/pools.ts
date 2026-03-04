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

export interface PoolMetadataResponse {
  success: boolean;
  data: {
    pool_id: string;
    name: string | null;
    ticker: string | null;
    description: string | null;
    homepage: string | null;
    extended: string | null;
  };
}

export interface PoolDelegatorsResponse {
  success: boolean;
  data: {
    pool_id: string;
    delegator_count: number;
    active_stake: string;
  };
}

export interface PoolDelegatorEntry {
  stake_address: string;
  amount: string;
  active_epoch_no: number;
}

export interface PoolDelegatorsListResponse {
  success: boolean;
  data: {
    pool_id: string;
    delegators: PoolDelegatorEntry[];
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

export interface DelegationHistoryResponse {
  success: boolean;
  data: {
    active_epoch: number;
    pool_id: string;
    tx_hash: string;
    cert_index: number;
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
