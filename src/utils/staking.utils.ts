/**
 * Staking utility functions for Cardano
 * Ported from Python staking.py and delegate_to_drep.py
 */

import { bech32 } from "bech32";
import { blake2b } from "blakejs";
import { encode as cborEncode } from "cbor2";
import {
  CertificateType,
  CardanoWitness,
  CardanoRewardWithdrawal,
  DRepKind,
  DRepInfo,
  Networks,
  DRepAction,
  CardanoAmounts,
  BuildPayloadOptions,
  CardanoCertificate,
} from "../types/index.js";
import { CARDANO_BASE_ADDRESS_MIN_LENGTH, CARDANO_PAYMENT_CREDENTIAL_OFFSET } from "../index.js";

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

  if (decoded.length < CARDANO_BASE_ADDRESS_MIN_LENGTH) {
    throw new Error(
      `Invalid base address length: ${decoded.length}, expected at least ${CARDANO_BASE_ADDRESS_MIN_LENGTH} bytes`
    );
  }

  // Extract stake credential (last 28 bytes)
  return decoded.subarray(CARDANO_PAYMENT_CREDENTIAL_OFFSET);
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
 * Certificate type: 2 (DELEGATION)
 */
export function buildDelegationCertificate(credential: Buffer, poolId: string): CardanoCertificate {
  const serializedCert = serializeCertificate(credential);
  const poolIdBytes = Buffer.from(poolId, "hex");
  return [CertificateType.DELEGATION, serializedCert, toUint8Array(poolIdBytes)];
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
      drepArray = [DRepKind.KEY_HASH, toUint8Array(drep.keyHash)];
      break;
    case DRepKind.SCRIPT_HASH:
      if (!drep.keyHash) {
        throw new Error("SCRIPT_HASH DRep requires keyHash");
      }
      drepArray = [DRepKind.SCRIPT_HASH, toUint8Array(drep.keyHash)];
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

  // Transaction structure: [txBody, witnesses, metadata]
  const signedTx = [
    deserializedTxPayload, // Transaction body (Map)
    witnessSet, // Witness set (Map)
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
  deserialized.set(3, ttl); // TTL

  // Optional fields - add in numerical order
  if (certificates && certificates.length > 0) {
    deserialized.set(4, certificates);
  }

  if (withdrawals && withdrawals.size > 0) {
    deserialized.set(5, withdrawals);
  }

  if (requiredSigners && requiredSigners.length > 0) {
    deserialized.set(
      14,
      requiredSigners.map((signer) => toUint8Array(signer))
    );
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
 * Convert DRep action string to DRepInfo
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
      return {
        kind: DRepKind.KEY_HASH,
        keyHash: Buffer.from(drepId, "hex"),
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
