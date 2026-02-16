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

/**
 * Enriched asset entry with metadata
 */
export interface EnrichedAsset {
  amount: number;
  metadata?: {
    name: string | null;
    ticker: string | null;
    decimals: number;
    formattedAmount: string;
    description: string | null;
    fingerprint: string | null;
  };
}

/**
 * Enriched balance response with metadata
 */
export interface EnrichedBalanceResponse {
  success: boolean;
  data: {
    lovelace: number;
    assets: {
      [assetId: string]: EnrichedAsset;
    };
  };
}

/**
 * Enriched grouped balance response with metadata
 */
export interface EnrichedGroupedBalanceResponse {
  success: boolean;
  data: {
    lovelace: number;
    assets: {
      [policyId: string]: {
        [assetName: string]: EnrichedAsset;
      };
    };
  };
}
