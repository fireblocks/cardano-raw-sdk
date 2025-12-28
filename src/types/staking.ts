/**
 * Staking and Governance type definitions for Cardano
 */

/**
 * Certificate types for Cardano staking and governance
 */
export enum CertificateType {
  STAKE_KEY_REGISTRATION = 0,
  STAKE_KEY_DEREGISTRATION = 1,
  DELEGATION = 2,
  VOTE_DELEGATION = 9, // Conway era governance
}

/**
 * DRep (Delegated Representative) action types for Conway governance
 */
export type DRepAction = "always-abstain" | "always-no-confidence" | "custom-drep";

/**
 * DRep kind enum matching Conway era specification
 */
export enum DRepKind {
  KEY_HASH = 0,
  SCRIPT_HASH = 1,
  ALWAYS_ABSTAIN = 2,
  ALWAYS_NO_CONFIDENCE = 3,
}

/**
 * Cardano UTXO representation
 */
export interface CardanoUTxO {
  txHash: string;
  indexInTx: number;
  nativeAmount: number;
}

/**
 * Cardano witness (signature + public key)
 */
export interface CardanoWitness {
  pubKey: Buffer;
  signature: Buffer;
}

/**
 * Cardano reward withdrawal
 */
export interface CardanoRewardWithdrawal {
  certificate: Buffer;
  reward: number; // in Lovelace
}

/**
 * Options for registering a staking credential
 */
export interface RegisterStakingOptions {
  vaultAccountId: string;
  index?: number;
  depositAmount?: number; // Default: 2000000 (2 ADA)
  fee?: number; // Default: 300000 (0.3 ADA)
}

/**
 * Options for delegating to a stake pool
 */
export interface DelegationOptions {
  vaultAccountId: string;
  poolId: string; // Pool key hash (hex format)
  index?: number;
  fee?: number; // Default: 300000 (0.3 ADA)
}

/**
 * Options for deregistering a staking credential
 */
export interface DeregisterStakingOptions {
  vaultAccountId: string;
  index?: number;
  fee?: number; // Default: 300000 (0.3 ADA)
}

/**
 * Options for withdrawing staking rewards
 */
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

/**
 * Staking reward information
 */
export interface StakingReward {
  poolId: string;
  amount: string;
  epoch: number;
}

/**
 * Withdrawal information
 */
export interface WithdrawalInfo {
  txHash: string;
  amount: string;
}

/**
 * Complete reward data response
 */
export interface RewardsData {
  rewards: StakingReward[];
  withdrawals: WithdrawalInfo[];
  availableRewards: number; // in Lovelace
  totalRewards: number; // in Lovelace
  totalWithdrawals: number; // in Lovelace
}

/**
 * Staking certificate structure
 */
export interface StakingCertificate {
  type: CertificateType;
  credential: Buffer;
  poolId?: string; // For delegation
  drep?: DRepInfo; // For vote delegation
}

/**
 * DRep information
 */
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
  operation: "register" | "delegate" | "deregister" | "withdraw-rewards" | "vote-delegate";
}

/**
 * DRep data from blockchain
 */
export interface DRepData {
  drepId: string;
  view: string;
  activeEpoch: number;
  amount: string;
  hasScript: boolean;
}

/**
 * Pool information
 */
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

/**
 * Account stake address information
 */
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
