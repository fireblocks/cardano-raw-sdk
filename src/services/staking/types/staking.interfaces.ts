/**
 * Staking Service Type Definitions
 * Interfaces and constants for dependency injection and value objects
 */

import {
  Networks,
  SupportedAssets,
  CardanoWitness,
  TransferResponse,
  WithdrawalMap,
} from "../../../types/index.js";
import { UtxoForStaking } from "../../../utils/staking.utils.js";

// ============================================================================
// Constants
// ============================================================================

export const STAKE_KEY_PATH_INDEX = 2;
export const PAYMENT_KEY_CHANGE_INDEX = 0;
export const EXPECTED_SIGNATURE_COUNT = 2;
export const REGISTRATION_VERIFICATION_DELAY_MS = 30000;
export const MIN_DREP_DELEGATION_AMOUNT_MULTIPLIER = 2;

// ============================================================================
// Interfaces for Dependency Injection
// ============================================================================

export interface INetworkConfiguration {
  readonly network: Networks;
  readonly assetId: SupportedAssets;
  isMainnet(): boolean;
}

export interface IStakeAddressResolver {
  getStakeAddress(vaultAccountId: string): Promise<string>;
  getBaseAddress(vaultAccountId: string, addressIndex?: number): Promise<AddressInfo>;
}

export interface IUtxoProvider {
  /**
   * Finds a single vault address whose pure-ADA UTxOs together cover `minAmount`,
   * returning those UTxOs aggregated (audit finding S-4). All inputs come from one
   * address so the transaction still needs only the payment + stake witnesses.
   */
  findAddressWithSuitableUtxo(vaultAccountId: string, minAmount: number): Promise<AddressWithUtxo>;
}

export interface ITransactionSigner {
  signTransaction(context: SigningContext): Promise<CardanoWitness[]>;
}

export interface ITransactionSubmitter {
  submitTransaction(signedTx: Buffer, skipValidation: boolean): Promise<TransferResponse>;
}

export interface IStakingValidator {
  validateRegistrationStatus(vaultAccountId: string, shouldBeRegistered: boolean): Promise<void>;
  validateDelegationPrerequisites(vaultAccountId: string, poolId: string): Promise<void>;
  checkRegistrationStatus(vaultAccountId: string): Promise<boolean>;
}

// ============================================================================
// Value Objects
// ============================================================================

export interface AddressInfo {
  readonly address: string;
  readonly addressIndex: number;
}

export interface AddressWithUtxo extends AddressInfo {
  /** Pure-ADA UTxOs from this address whose combined lovelace covers the required amount. */
  readonly utxos: UtxoForStaking[];
  /** Combined lovelace of `utxos`. */
  readonly totalAmount: number;
  /**
   * Release the UTXO lock held on `utxos`. Should be called in finally blocks after the
   * transaction completes. If not called, the lock auto-expires after UTXO_LOCK_TTL_MS.
   */
  readonly release: () => void;
}

export interface SigningContext {
  readonly txHash: string;
  readonly vaultAccountId: string;
  readonly operation: string;
  readonly addressIndex: number;
}

export interface TransactionBuildContext {
  readonly toAddress: string;
  readonly netAmount: number;
  readonly utxos: UtxoForStaking[];
  readonly fee: number;
  readonly ttl?: number; // Optional for Conway-era governance transactions
  readonly certificates?: Array<unknown>;
  readonly withdrawals?: WithdrawalMap;
  /** Conway-era voting procedures (key 19 in the TX body) */
  readonly votingProcedures?: Map<unknown, unknown>;
  readonly network: Networks;
}
