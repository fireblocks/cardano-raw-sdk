import { DRepAction, DRepKind, Networks, StakingOperation } from "./index.js";

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
  fee: number; // Default: 300000 (0.3 ADA)
}

export interface DeregisterStakingOptions {
  vaultAccountId: string;
  fee: number; // Default: 300000 (0.3 ADA)
}

export interface WithdrawRewardsOptions {
  vaultAccountId: string;
  limit?: number; // Maximum amount to withdraw (in Lovelace). If not specified, withdraw all
  fee: number; // Default: 300000 (0.3 ADA)
}

/**
 * Options for registering the vault account as a DRep (Conway era)
 */
export interface RegisterAsDRepOptions {
  vaultAccountId: string;
  /** Optional anchor: URL pointing to DRep metadata JSON and its blake2b-256 hash */
  anchor?: {
    /** Publicly accessible URL of the DRep metadata document */
    url: string;
    /** Blake2b-256 hash (hex) of the metadata document at `url` */
    dataHash: string;
  };
  /** Deposit amount in lovelace (default: 500 ADA = 500,000,000 lovelace) */
  depositAmount?: number;
  /** Transaction fee in lovelace (default: GOVERNANCE_TX_FEE) */
  fee?: number;
}

/**
 * Result of registering as a DRep
 */
export interface RegisterAsDRepResult extends StakingTransactionResult {
  /** DRep ID derived from the stake key credential (bech32 drep1...) */
  drepId: string;
  /** Address index used for the transaction */
  addressIndex: number;
}

/**
 * Options for delegating voting power to a DRep (Conway era)
 */
export interface DRepDelegationOptions {
  vaultAccountId: string;
  drepAction: DRepAction;
  drepId?: string; // Required if drepAction is 'custom-drep' (hex format)
  fee: number; // Default: 1000000 (1 ADA)
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
  addressIndex?: number;
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

export type CardanoCertificate = [number, [number, Uint8Array], ...unknown[]];

/**
 * Options for casting a governance vote as a DRep (Conway era)
 */
export interface CastVoteOptions {
  vaultAccountId: string;
  /** The governance action to vote on */
  governanceActionId: {
    /** Transaction hash (hex) of the transaction that proposed the governance action */
    txHash: string;
    /** Index of the governance action within that transaction */
    index: number;
  };
  /** Vote choice */
  vote: "yes" | "no" | "abstain";
  /** Optional anchor linking to vote rationale metadata */
  anchor?: {
    /** Publicly accessible URL of the vote rationale document */
    url: string;
    /** Blake2b-256 hash (hex, 64 chars) of the document at `url` */
    dataHash: string;
  };
  /** Transaction fee in lovelace (default: GOVERNANCE_TX_FEE) */
  fee?: number;
}

/**
 * Result of casting a governance vote
 */
export interface CastVoteResult extends StakingTransactionResult {
  /** The vote cast: "yes" | "no" | "abstain" */
  vote: string;
  /** The governance action ID that was voted on */
  governanceActionId: { txHash: string; index: number };
}

export interface BuildPayloadOptions {
  toAddress: string;
  netAmount: number;
  txInputs: Array<{ txHash: Buffer; indexInTx: number }>;
  feeAmount: number;
  ttl?: number; // Optional for Conway-era governance transactions
  certificates?: Array<unknown>;
  withdrawals?: Map<Uint8Array, number>;
  /** Conway-era voting procedures (key 19 in the TX body) */
  votingProcedures?: Map<unknown, unknown>;
  network: Networks;
}
