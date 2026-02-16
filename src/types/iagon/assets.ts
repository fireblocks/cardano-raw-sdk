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

export interface AssetMetadata {
  name: string;
  ticker: string;
  description: string;
  decimals: number;
  image: string;
  url: string;
  logo: string;
}

export interface AssetInfoResponse {
  success: true;
  data: {
    policy_id: string;
    asset_name: string;
    asset_name_ascii: string | null;
    fingerprint: string;
    total_supply: string;
    mint_count: number;
    burn_count: number;
    first_mint_tx: string;
    first_mint_slot: number;
    first_mint_time: string;
    metadata: AssetMetadata | null;
    metadata_source: string | null;
  };
}
