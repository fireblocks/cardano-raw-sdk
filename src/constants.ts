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
  ADA_DECIMALS = 6, // 1 ADA = 1,000,000 lovelace
}

export enum CardanoAmounts {
  DEPOSIT_AMOUNT = 2_000_000,
  /**
   * Fee for staking operations (register, deregister, delegate, withdraw)
   * These are ADA-only transactions with fixed-size certificates
   */
  STAKING_TX_FEE = 300_000,
  /**
   * Fee for governance operations (DRep delegation)
   * These transactions involve governance certificates
   */
  GOVERNANCE_TX_FEE = 1_000_000,
  MIN_UTXO_VALUE_ADA_ONLY = 1_000_000,
  /**
   * Base minimum lovelace for any UTXO (Cardano protocol parameter)
   * This is the minimum for ADA-only or single-policy UTXOs
   */
  MIN_UTXO_BASE_LOVELACE = 1_000_000,
  /**
   * Additional lovelace required per token policy (Cardano protocol parameter)
   * Each distinct policy in a UTXO adds ~0.15 ADA to the minimum requirement
   */
  MIN_UTXO_PER_POLICY_LOVELACE = 150_000,
  TX_TTL_SECS = 7_200,
}
