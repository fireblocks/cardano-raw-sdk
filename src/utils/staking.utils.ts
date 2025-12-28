/**
 * Staking utility functions for Cardano
 * Ported from Python staking.py and delegate_to_drep.py
 */

import { bech32 } from "bech32";
import { blake2b } from "blakejs";
import * as cbor from "cbor";
import {
  CertificateType,
  CardanoWitness,
  CardanoRewardWithdrawal,
  DRepKind,
  DRepInfo,
} from "../types/staking.js";
import { Networks } from "../types/index.js";

// Constants from Python code
export const BIP_44_CONSTANT = 44;
export const ADA_COIN_TYPE = 1815;
export const ADA_TEST_COIN_TYPE = 1;
export const CHANGE_INDEX = 0;
export const PERMANENT_ACCOUNT_INDEX = 0;
export const CHIMERIC_INDEX = 2; // For staking key
export const DEFAULT_NATIVE_TX_FEE = 300000; // 0.3 ADA
export const DEPOSIT_AMOUNT = 2000000; // 2 ADA
export const TX_TTL_SECS = 7200; // 2 hours
export const MIN_UTXO_VALUE_ADA_ONLY = 1000000; // 1 ADA

/**
 * Blake2b hash with configurable digest size (default 28 bytes for address hash, 32 for TX hash)
 */
export function blakeHash(payload: Buffer, digestSize: number = 28): Buffer {
  const hash = blake2b(payload, undefined, digestSize);
  return Buffer.from(hash);
}

/**
 * Calculate transaction hash for signing (32 byte Blake2b hash)
 */
export function getSigningPayload(serializedTx: Buffer): Buffer {
  return blakeHash(serializedTx, 32);
}

/**
 * Get stake address HRP (human readable part) based on network
 */
export function getStakeAddressHrp(mainnet: boolean): string {
  return mainnet ? "stake" : "stake_test";
}

/**
 * Get address HRP based on network
 */
export function getAddressHrp(mainnet: boolean): string {
  return mainnet ? "addr" : "addr_test";
}

/**
 * Get stake address bytes prefix based on network
 */
export function stakeAddressBytesPrefix(mainnet: boolean): Buffer {
  return Buffer.from([mainnet ? 0xe1 : 0xe0]);
}

/**
 * Encode stake address from bytes to bech32 format
 */
export function encodeStakeAddress(decodedAddress: Buffer, mainnet: boolean): string {
  const hrp = getStakeAddressHrp(mainnet);
  const words = bech32.toWords(decodedAddress);
  return bech32.encode(hrp, words);
}

/**
 * Decode Cardano address from bech32 to bytes
 */
export function decodeAddress(encodedAddress: string, mainnet: boolean): Buffer {
  const expectedHrp = getAddressHrp(mainnet);

  if (!encodedAddress.startsWith(`${expectedHrp}1`)) {
    throw new Error(
      `Address ${encodedAddress} is invalid (use Shelley-era addresses with ${expectedHrp} prefix)`
    );
  }

  const decoded = bech32.decode(encodedAddress);
  const addressBytes = Buffer.from(bech32.fromWords(decoded.words));
  return addressBytes;
}

/**
 * Extract stake credential (last 28 bytes) from a base address
 */
export function getCertificateFromBaseAddress(baseAddress: string, mainnet: boolean): Buffer {
  const decoded = decodeAddress(baseAddress, mainnet);

  // Base address structure: 1 byte header + 28 bytes payment credential + 28 bytes stake credential
  if (decoded.length < 57) {
    throw new Error(`Invalid base address length: ${decoded.length}, expected at least 57 bytes`);
  }

  // Extract stake credential (last 28 bytes)
  return decoded.slice(29);
}

/**
 * Get stake address from certificate (credential hash)
 */
export function getStakeAddressFromCertificate(certificate: Buffer, mainnet: boolean): string {
  const prefix = stakeAddressBytesPrefix(mainnet);
  const fullAddress = Buffer.concat([prefix, certificate]);
  return encodeStakeAddress(fullAddress, mainnet);
}

/**
 * Get stake address from base address
 */
export function getStakeAddressFromBaseAddress(baseAddress: string, mainnet: boolean): string {
  const certificate = getCertificateFromBaseAddress(baseAddress, mainnet);
  return getStakeAddressFromCertificate(certificate, mainnet);
}

/**
 * Serialize certificate for CBOR encoding
 * Returns [0, certificate] array
 */
export function serializeCertificate(certificate: Buffer): [number, Buffer] {
  return [0, certificate];
}

/**
 * Build stake key registration certificate
 * Certificate type: 0 (STAKE_KEY_REGISTRATION)
 */
export function buildRegistrationCertificate(credential: Buffer): Array<any> {
  const serializedCert = serializeCertificate(credential);
  return [CertificateType.STAKE_KEY_REGISTRATION, serializedCert];
}

/**
 * Build stake key deregistration certificate
 * Certificate type: 1 (STAKE_KEY_DEREGISTRATION)
 */
export function buildDeregistrationCertificate(credential: Buffer): Array<any> {
  const serializedCert = serializeCertificate(credential);
  return [CertificateType.STAKE_KEY_DEREGISTRATION, serializedCert];
}

/**
 * Build pool delegation certificate
 * Certificate type: 2 (DELEGATION)
 */
export function buildDelegationCertificate(credential: Buffer, poolId: string): Array<any> {
  const serializedCert = serializeCertificate(credential);
  const poolIdBytes = Buffer.from(poolId, "hex");
  return [CertificateType.DELEGATION, serializedCert, poolIdBytes];
}

/**
 * Build vote delegation certificate (Conway era)
 * Certificate type: 9 (VOTE_DELEGATION)
 */
export function buildVoteDelegationCertificate(credential: Buffer, drep: DRepInfo): Array<any> {
  const serializedCert = serializeCertificate(credential);

  let drepArray: Array<any>;

  switch (drep.kind) {
    case DRepKind.ALWAYS_ABSTAIN:
      drepArray = [DRepKind.ALWAYS_ABSTAIN];
      break;
    case DRepKind.ALWAYS_NO_CONFIDENCE:
      drepArray = [DRepKind.ALWAYS_NO_CONFIDENCE];
      break;
    case DRepKind.KEY_HASH:
      if (!drep.keyHash) {
        throw new Error("KEY_HASH DRep requires keyHash");
      }
      drepArray = [DRepKind.KEY_HASH, drep.keyHash];
      break;
    case DRepKind.SCRIPT_HASH:
      if (!drep.keyHash) {
        throw new Error("SCRIPT_HASH DRep requires keyHash");
      }
      drepArray = [DRepKind.SCRIPT_HASH, drep.keyHash];
      break;
    default:
      throw new Error(`Unknown DRep kind: ${drep.kind}`);
  }

  return [CertificateType.VOTE_DELEGATION, serializedCert, drepArray];
}

/**
 * Serialize withdrawals as a map for CBOR encoding
 */
export function serializeWithdrawals(
  withdrawals: CardanoRewardWithdrawal[]
): Record<string, number> {
  const withdrawalMap: Record<string, number> = {};

  for (const withdrawal of withdrawals) {
    // Use certificate as key (as hex string) and reward as value
    const key = withdrawal.certificate.toString("hex");
    withdrawalMap[key] = withdrawal.reward;
  }

  return withdrawalMap;
}

/**
 * Embed signatures in transaction to create final signed transaction
 */
export function embedSignaturesInTx(
  deserializedTxPayload: Record<string, any>,
  signatures: CardanoWitness[]
): Buffer {
  const witnessesArr: Array<[Buffer, Buffer]> = [];

  for (const sig of signatures) {
    witnessesArr.push([sig.pubKey, sig.signature]);
  }

  // Transaction structure: [txBody, witnesses, metadata]
  const deserialized = [
    deserializedTxPayload,
    { 0: witnessesArr }, // Witness set with vkey witnesses
    null, // No auxiliary data
  ];

  return Buffer.from(cbor.encode(deserialized));
}

/**
 * Build transaction payload (transaction body) for CBOR encoding
 */
export interface BuildPayloadOptions {
  toAddress: string;
  netAmount: number;
  txInputs: Array<{ txHash: Buffer; indexInTx: number }>;
  feeAmount: number;
  ttl: number;
  certificates?: Array<any>;
  withdrawals?: Record<string, number>;
  network: Networks;
}

export function buildPayload(options: BuildPayloadOptions): {
  serialized: Buffer;
  deserialized: Record<number, any>;
} {
  const { toAddress, netAmount, txInputs, feeAmount, ttl, certificates, withdrawals, network } =
    options;

  // Build inputs array
  const inputsArr = txInputs.map((input) => [input.txHash, input.indexInTx]);

  // Build outputs array
  const decodedToAddress = decodeAddress(toAddress, network === Networks.MAINNET);
  const outputsArr = [[decodedToAddress, netAmount]];

  // Build transaction body
  const deserialized: Record<number, any> = {
    0: inputsArr, // inputs
    1: outputsArr, // outputs
    2: feeAmount, // fee
    3: ttl, // TTL
  };

  if (certificates && certificates.length > 0) {
    deserialized[4] = certificates;
  }

  if (withdrawals && Object.keys(withdrawals).length > 0) {
    deserialized[5] = withdrawals;
  }

  const serialized = Buffer.from(cbor.encode(deserialized));

  return { serialized, deserialized };
}

/**
 * Calculate TTL (time to live) for transaction
 */
export function calculateTtl(currentSlot: number, ttlSecs: number = TX_TTL_SECS): number {
  return currentSlot + ttlSecs;
}

/**
 * Find suitable UTXO for staking operations
 */
export interface UtxoForStaking {
  txHash: string;
  indexInTx: number;
  nativeAmount: number;
}

export function findSuitableUtxo(
  utxos: Array<{ transaction_id: string; output_index: number; value: { lovelace: number } }>,
  minAmount: number
): UtxoForStaking | null {
  for (const utxo of utxos) {
    if (utxo.value.lovelace > minAmount) {
      return {
        txHash: utxo.transaction_id,
        indexInTx: utxo.output_index,
        nativeAmount: utxo.value.lovelace,
      };
    }
  }
  return null;
}

/**
 * Convert DRep action string to DRepInfo
 */
export function drepActionToDRepInfo(
  action: "always-abstain" | "always-no-confidence" | "custom-drep",
  drepId?: string
): DRepInfo {
  switch (action) {
    case "always-abstain":
      return { kind: DRepKind.ALWAYS_ABSTAIN };
    case "always-no-confidence":
      return { kind: DRepKind.ALWAYS_NO_CONFIDENCE };
    case "custom-drep":
      if (!drepId) {
        throw new Error("custom-drep requires drepId");
      }
      return {
        kind: DRepKind.KEY_HASH,
        keyHash: Buffer.from(drepId, "hex"),
      };
    default:
      throw new Error(`Unknown DRep action: ${action}`);
  }
}
