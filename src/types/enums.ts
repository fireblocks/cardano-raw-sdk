export enum Networks {
  MAINNET = "mainnet",
  PREPROD = "preprod",
  PREVIEW = "preview",
}

export enum TransactionType {
  GET_BLALANCE_BY_ADDRESS = "checkBalanceByAddress",
  GET_BLALNCE_BY_CREDENTIAL_ID = "getBalanceByCredential",
  GET_BALANCE_BY_STAKE_KEY = "getBalanceByStakeKey",
  GET_TRANSACTIONS_HISTORY = "getTransactionsHistory",
  TRANSFER = "TRANSFER",
}

/**
 * Fireblocks asset IDs for Cardano networks
 * These map to internal Fireblocks asset identifiers used for transaction signing
 */
export enum SupportedAssets {
  /** Fireblocks asset ID for Cardano mainnet */
  ADA = "ADA",
  /** Fireblocks asset ID for Cardano testnets (preprod/preview) */
  ADA_TEST = "ADA_TEST",
}

export enum GroupByOptions {
  TOKEN = "token",
  ADDRESS = "address",
  POLICY = "policy",
}

export enum WebhookEventTypes {
  TRANSACTION_CREATED = "transaction.created",
  TRANSACTION_STATUS_UPDATED = "transaction.status.updated",
  TRANSACTION_APPROVAL_STATUS_UPDATED = "transaction.approval_status.updated",
  TRANSACTION_NETWORK_RECORDS_PROCESSING_COMPLETED = "transaction.network_records.processing_completed",
}

export enum RewardType {
  LEADER = "leader",
  MEMBER = "member",
  RESERVES = "reserves",
  TREASURY = "treasury",
  REFUND = "refund",
}

export enum PoolStatus {
  ACTIVE = "active",
  RETIRING = "retiring",
  RETRIED = "retried",
}

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
 * Certificate types for Cardano staking and governance
 */
export enum CertificateType {
  // Pre-Conway era certificates (Shelley through Babbage)
  STAKE_KEY_REGISTRATION = 0, // Shelley era (not 7)
  STAKE_KEY_DEREGISTRATION = 1, // Shelley era (not 8)
  DELEGATION = 2,

  // Conway era certificates
  STAKE_REGISTRATION = 7, // Conway: includes deposit amount
  STAKE_DEREGISTRATION = 8, // Conway: includes refund amount
  VOTE_DELEGATION = 9, // Conway: voting delegation
}

/**
 * DRep (Delegated Representative) action types for Conway governance
 */
export enum DRepAction {
  ALWAYS_ABSTAIN = "always-abstain",
  ALWAYS_NO_CONFIDENCE = "always-no-confidence",
  CUSTOM_DREP = "custom-drep",
}

export enum StakingOperation {
  REGISTER = "register",
  DELEGATE = "delegate",
  DEREGISTER = "deregister",
  WITHDRAW_REWARDS = "withdraw-rewards",
  VOTE_DELEGATE = "vote-delegate",
}
