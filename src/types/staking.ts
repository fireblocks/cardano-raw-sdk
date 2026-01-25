import { DRepAction, DRepKind, StakingOperation } from "./index.js";

export interface CardanoWitness {
  pubKey: Buffer;
  signature: Buffer;
}

export interface CardanoRewardWithdrawal {
  certificate: Buffer;
  reward: number; // in Lovelace
}

export interface RegisterStakingOptions {
  vaultAccountId: string;
  index?: number;
  depositAmount?: number; // Default: 2000000 (2 ADA)
  fee?: number; // Default: 300000 (0.3 ADA)
}

export interface DelegationOptions {
  vaultAccountId: string;
  poolId: string; // Pool key hash (hex format)
  index?: number;
  fee?: number; // Default: 300000 (0.3 ADA)
}

export interface DeregisterStakingOptions {
  vaultAccountId: string;
  index?: number;
  fee?: number; // Default: 300000 (0.3 ADA)
}

export interface WithdrawRewardsOptions {
  vaultAccountId: string;
  limit?: number; // Maximum amount to withdraw (in Lovelace). If not specified, withdraw all
  index?: number;
  fee?: number; // Default: 300000 (0.3 ADA)
}

/**
 * Options for delegating voting power to a DRep (Conway era)
 */
export interface DRepDelegationOptions {
  vaultAccountId: string;
  drepAction: DRepAction;
  drepId?: string; // Required if drepAction is 'custom-drep' (hex format)
  index?: number;
  fee?: number; // Default: 1000000 (1 ADA)
}

export interface StakingReward {
  poolId: string;
  amount: string;
  epoch: number;
}

export interface RewardsData {
  rewards: StakingReward[];
  availableRewards: number; // in Lovelace
  totalRewards: number; // in Lovelace
  totalWithdrawals: number; // in Lovelace
}

export interface DRepInfo {
  kind: DRepKind;
  keyHash?: Buffer; // For KEY_HASH or SCRIPT_HASH types
}

/**
 * Staking transaction result
 */
export interface StakingTransactionResult {
  txHash: string;
  status: string;
  operation: StakingOperation;
}

export interface PoolInfo {
  poolId: string;
  hex: string;
  vrfKey: string;
  blocksMinted: number;
  blocksMintedEpoch: number;
  liveStake: string;
  liveSize: number;
  liveSaturation: number;
  liveDelegators: number;
  activeStake: string;
  activeSize: number;
  declaredPledge: string;
  livePledge: string;
  marginCost: number;
  fixedCost: string;
  rewardAccount: string;
  owners: string[];
  registration: string[];
  retirement: string[];
}

export interface StakeAddressInfo {
  stakeAddress: string;
  active: boolean;
  activeEpoch: number | null;
  controlledAmount: string;
  rewardsSum: string;
  withdrawalsSum: string;
  reservesSum: string;
  treasurySum: string;
  withdrawableAmount: string;
  poolId: string | null;
}
