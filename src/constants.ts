export const iagonBaseUrl = "https://api.fireblocks.partners.iagon.com";
// export const tokenTransactionFee = 200000;
// export const MIN_RECIPIENT_LOVELACE = 1_200_000;
// export const MIN_CHANGE_LOVELACE = 1_200_000;

// export const STAKING_DEPOSIT_AMOUNT = 2_000_000; // 2 ADA
// export const STAKING_DEPOSIT_FEE = 300_000; // 0.3 ADA

// export const CARDANO_BASE_ADDRESS_MIN_LENGTH = 57; // 1 byte header + 28 bytes payment + 28 bytes stake
// export const CARDANO_PAYMENT_CREDENTIAL_OFFSET = 29; // 1 byte header + 28 bytes payment hash
// export const MIN_DREP_DELEGATION_ADA = 2; // Minimum ADA for DRep operations

export enum CardanoConstants {
  BIP_44_CONSTANT = 44,
  ADA_COIN_TYPE = 1815,
  ADA_TEST_COIN_TYPE = 1,
  CHANGE_INDEX = 0,
  PERMANENT_ACCOUNT_INDEX = 0,
  CHIMERIC_INDEX = 2,
  CARDANO_BASE_ADDRESS_MIN_LENGTH = 57, // 1 byte header + 28 bytes payment + 28 bytes stake
  CARDANO_PAYMENT_CREDENTIAL_OFFSET = 29, // 1 byte header + 28 bytes payment hash
}

export enum CardanoAmounts {
  MIN_RECIPIENT_LOVELACE = 1_200_000,
  MIN_CHANGE_LOVELACE = 1_200_000,
  DEPOSIT_AMOUNT = 2_000_000,
  DEFAULT_NATIVE_TX_FEE = 300_000,
  MIN_UTXO_VALUE_ADA_ONLY = 1_000_000,
  TX_TTL_SECS = 7_200,
}
