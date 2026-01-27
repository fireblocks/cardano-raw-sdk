/**
 * Staking utility functions for Cardano
 * Ported from Python staking.py and delegate_to_drep.py
 */

import { bech32 } from "bech32";
import { blake2b } from "blakejs";
import { encode as cborEncode, decode } from "cbor2";
import {
  CertificateType,
  CardanoWitness,
  CardanoRewardWithdrawal,
  DRepKind,
  DRepInfo,
  Networks,
  DRepAction,
  BuildPayloadOptions,
  CardanoCertificate,
} from "../types/index.js";
import { CardanoAmounts, CardanoConstants } from "../index.js";
import * as CardanoWasm from "@emurgo/cardano-serialization-lib-nodejs";

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

  // Use a higher limit (1000) to accommodate Cardano addresses
  const decoded = bech32.decode(encodedAddress, 1000);
  const addressBytes = Buffer.from(bech32.fromWords(decoded.words));
  return addressBytes;
}

/**
 * Extract stake credential (last 28 bytes) from a base address
 */
export function getCertificateFromBaseAddress(baseAddress: string, mainnet: boolean): Buffer {
  const decoded = decodeAddress(baseAddress, mainnet);

  if (decoded.length < CardanoConstants.CARDANO_BASE_ADDRESS_MIN_LENGTH) {
    throw new Error(
      `Invalid base address length: ${decoded.length}, expected at least ${CardanoConstants.CARDANO_BASE_ADDRESS_MIN_LENGTH} bytes`
    );
  }

  // Extract stake credential (last 28 bytes)
  return decoded.subarray(CardanoConstants.CARDANO_PAYMENT_CREDENTIAL_OFFSET);
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
 * Convert Buffer to Uint8Array for CBOR encoding
 */
function toUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Serialize certificate for CBOR encoding
 * Returns [0, certificate] array
 */
export function serializeCertificate(certificate: Buffer): [number, Uint8Array] {
  const certBuffer = Buffer.isBuffer(certificate) ? certificate : Buffer.from(certificate, "hex");

  return [0, toUint8Array(certBuffer)];
}

/**
 * Build stake key registration certificate (Conway era)
 * Certificate type: 7 (STAKE_REGISTRATION) - includes deposit amount
 */
export function buildRegistrationCertificate(credential: Buffer): CardanoCertificate {
  const serializedCert = serializeCertificate(credential);

  return [
    CertificateType.STAKE_KEY_REGISTRATION, // Type 0 for Shelley
    serializedCert, // [0, credential_buffer]
  ];
}

/**
 * Build stake key deregistration certificate (Shelley era)
 * Certificate type: 1 (STAKE_DEREGISTRATION)
 */
export function buildDeregistrationCertificate(credential: Buffer): CardanoCertificate {
  const serializedCert = serializeCertificate(credential);
  return [
    CertificateType.STAKE_KEY_DEREGISTRATION, // Type 1 for Shelley
    serializedCert,
  ];
}

/**
 * Build pool delegation certificate
 */
export function buildDelegationCertificate(
  credential: Buffer,
  poolId: string
): CardanoWasm.Certificate {
  const credentialHash = CardanoWasm.Ed25519KeyHash.from_bytes(credential);
  const stakeCredential = CardanoWasm.Credential.from_keyhash(credentialHash);

  const poolKeyHash = CardanoWasm.Ed25519KeyHash.from_hex(poolId);
  const stakeDelegation = CardanoWasm.StakeDelegation.new(stakeCredential, poolKeyHash);

  return CardanoWasm.Certificate.new_stake_delegation(stakeDelegation);
}

/**
 * Build vote delegation certificate (Conway era)
 */
export function buildVoteDelegationCertificate(credential: Buffer, drep: DRepInfo): any {
  // Stake credential: [0, credential_bytes]
  const stakeCredential = [0, toUint8Array(credential)];

  let drepValue: Array<any>;

  switch (drep.kind) {
    case DRepKind.ALWAYS_ABSTAIN:
      // [2] for ALWAYS_ABSTAIN
      drepValue = [2];
      break;
    case DRepKind.ALWAYS_NO_CONFIDENCE:
      // [3] for ALWAYS_NO_CONFIDENCE
      drepValue = [3];
      break;
    case DRepKind.KEY_HASH:
      if (!drep.keyHash) {
        throw new Error("KEY_HASH DRep requires keyHash");
      }
      // [0, key_hash]
      drepValue = [0, toUint8Array(drep.keyHash)];
      break;
    case DRepKind.SCRIPT_HASH:
      if (!drep.keyHash) {
        throw new Error("SCRIPT_HASH DRep requires keyHash");
      }
      // [1, script_hash]
      drepValue = [1, toUint8Array(drep.keyHash)];
      break;
    default:
      throw new Error(`Unknown DRep kind: ${drep.kind}`);
  }

  // Return: [9, [0, credential], drep_value]
  return [9, stakeCredential, drepValue];
}

/**
 * Serialize withdrawals as a map for CBOR encoding
 */
export function serializeWithdrawals(
  withdrawals: CardanoRewardWithdrawal[]
): Map<Uint8Array, number> {
  const withdrawalMap = new Map<Uint8Array, number>();
  for (const withdrawal of withdrawals) {
    withdrawalMap.set(toUint8Array(withdrawal.certificate), withdrawal.reward);
  }
  return withdrawalMap;
}

/**
 * Embed signatures in transaction to create final signed transaction
 * Witnesses are automatically sorted by key hash as required by Cardano
 */
export function embedSignaturesInTx(
  deserializedTxPayload: Map<number, any>,
  signatures: CardanoWitness[]
): Buffer {
  // Sort witnesses by public key hash
  const sortedSignatures = sortWitnesses(signatures);

  // Convert witness buffers to Uint8Array for proper CBOR byte string encoding
  const witnessesArr: Array<[Uint8Array, Uint8Array]> = sortedSignatures.map((sig) => [
    toUint8Array(sig.pubKey),
    toUint8Array(sig.signature),
  ]);

  const witnessSet = new Map([[0, witnessesArr]]);

  // Transaction structure for Conway era: [txBody, witnesses, validity, auxiliary_data]
  const signedTx = [
    deserializedTxPayload, // Transaction body (Map)
    witnessSet, // Witness set (Map)
    true, // Transaction validity (required in Conway era)
    null, // Auxiliary data/metadata (null)
  ];

  return Buffer.from(cborEncode(signedTx));
}

/**
 * Build transaction payload (transaction body) for CBOR encoding
 */
export function buildPayload(options: BuildPayloadOptions): {
  serialized: Buffer;
  deserialized: Map<number, any>;
} {
  const {
    toAddress,
    netAmount,
    txInputs,
    feeAmount,
    ttl,
    certificates,
    withdrawals,
    requiredSigners,
    network,
  } = options;

  // Build inputs array
  const inputsArr = txInputs.map((input) => {
    const txHashBuffer = Buffer.isBuffer(input.txHash)
      ? input.txHash
      : Buffer.from(input.txHash, "hex");

    return [toUint8Array(txHashBuffer), input.indexInTx];
  });

  // Build outputs array
  const decodedToAddress = decodeAddress(toAddress, network === Networks.MAINNET);
  const addressBuffer = Buffer.isBuffer(decodedToAddress)
    ? decodedToAddress
    : Buffer.from(decodedToAddress, "hex");

  const outputsArr = [[toUint8Array(addressBuffer), netAmount]];

  // Build transaction body using Map for integer keys
  const deserialized = new Map<number, any>();

  deserialized.set(0, inputsArr); // inputs
  deserialized.set(1, outputsArr); // outputs
  deserialized.set(2, feeAmount); // fee

  // TTL (invalid_hereafter) - optional, only include if provided
  if (ttl !== undefined && ttl !== null) {
    deserialized.set(3, ttl);
  }

  // Optional fields - add in numerical order
  if (certificates && certificates.length > 0) {
    const certsArr = certificates.map((cert: any) => {
      // If it's already an array (manual certificate), use it directly
      if (Array.isArray(cert)) {
        return cert;
      }
      // If it's a CSL Certificate object, decode it
      if (typeof cert.to_bytes === "function") {
        const certBytes = cert.to_bytes();
        return decode(certBytes);
      }
      // Otherwise return as-is
      return cert;
    });
    deserialized.set(4, certsArr);
  }

  const serialized = Buffer.from(cborEncode(deserialized));

  return { serialized, deserialized };
}

/**
 * Calculate TTL (time to live) for transaction
 */
export function calculateTtl(
  currentSlot: number,
  ttlSecs: number = CardanoAmounts.TX_TTL_SECS
): number {
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
  utxos: Array<{
    transaction_id: string;
    output_index: number;
    value: {
      lovelace: number;
      assets?: any;
    };
  }>,
  minAmount: number
): UtxoForStaking | null {
  for (const utxo of utxos) {
    // Skip UTXOs that contain tokens - only use pure ADA UTXOs for staking
    const hasTokens = utxo.value.assets && Object.keys(utxo.value.assets).length > 0;

    if (!hasTokens && utxo.value.lovelace > minAmount) {
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
 * Decode DRep ID from bech32 or hex format
 * Bech32 format: drep1... or drep_script1...
 * Hex format: 28-byte hex string
 */
function decodeDRepId(drepId: string): { keyHash: Buffer; isScript: boolean } {
  // Check if it's bech32 format (starts with drep1 or drep_script1)
  if (drepId.startsWith("drep1") || drepId.startsWith("drep_script1")) {
    const decoded = bech32.decode(drepId, 1000);
    const fullBytes = Buffer.from(bech32.fromWords(decoded.words));

    // First byte is the header indicating the type
    const header = fullBytes[0];
    const keyHash = Buffer.from(fullBytes.subarray(1)); // Skip header byte to get 28-byte key hash

    // Header format: 0b00100010 (0x22) for key hash, 0b00100011 (0x23) for script hash
    const isScript = (header & 0x01) === 1;

    return { keyHash, isScript };
  }

  // Otherwise treat as hex
  return { keyHash: Buffer.from(drepId, "hex"), isScript: false };
}

/**
 * Convert DRep action string to DRepInfo
 * Supports both bech32 (drep1...) and hex formats for custom DReps
 */
export function drepActionToDRepInfo(action: DRepAction, drepId?: string): DRepInfo {
  switch (action) {
    case DRepAction.ALWAYS_ABSTAIN:
      return { kind: DRepKind.ALWAYS_ABSTAIN };
    case DRepAction.ALWAYS_NO_CONFIDENCE:
      return { kind: DRepKind.ALWAYS_NO_CONFIDENCE };
    case DRepAction.CUSTOM_DREP:
      if (!drepId) {
        throw new Error("custom-drep requires drepId");
      }

      const { keyHash, isScript } = decodeDRepId(drepId);

      return {
        kind: isScript ? DRepKind.SCRIPT_HASH : DRepKind.KEY_HASH,
        keyHash,
      };
    default:
      throw new Error(`Unknown DRep action: ${action}`);
  }
}

/**
 * Hash public key to get key hash (28 bytes)
 * Used for requiredSigners field
 */
export function hashPublicKey(pubKey: Buffer): Buffer {
  return blakeHash(pubKey, 28);
}

/**
 * Sort witnesses by public key hash in lexicographic order
 * Cardano requires witnesses to be sorted for transaction validation
 */
export function sortWitnesses(witnesses: CardanoWitness[]): CardanoWitness[] {
  return witnesses.slice().sort((a, b) => {
    const hashA = blakeHash(a.pubKey, 28);
    const hashB = blakeHash(b.pubKey, 28);
    return hashA.compare(hashB);
  });
}
