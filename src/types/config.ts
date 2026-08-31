export interface PoolConfig {
  maxPoolSize: number;
  idleTimeoutMs: number;
  cleanupIntervalMs: number;
  connectionTimeoutMs: number;
  retryAttempts: number;
}

/**
 * Cardano protocol parameters that may change at hard forks.
 * These can be overridden via SDK configuration to adapt to protocol updates
 * without waiting for an SDK release.
 */
export interface ProtocolParams {
  /** Fee coefficient A: lovelace per transaction byte (default: 44) */
  minFeeA: number;
  /** Fee constant B: base lovelace fee (default: 155381) */
  minFeeB: number;
  /** Lovelace per UTxO byte for min-ada calculations (default: 4310) */
  coinsPerUtxoByte: number;
  /** Stake key registration/deregistration deposit (default: 2_000_000) */
  stakeKeyDeposit: number;
  /** DRep registration deposit (default: 500_000_000) */
  drepDeposit: number;
}

export interface SdkManagerMetrics {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  instancesByVaultAccount: Record<string, boolean>;
}
