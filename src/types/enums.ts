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

export enum SupportedAssets {
  ADA = "ADA",
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
