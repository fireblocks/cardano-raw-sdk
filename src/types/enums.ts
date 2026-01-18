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
