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
