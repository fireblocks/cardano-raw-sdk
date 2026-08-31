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
  WithdrawalMap,
  SdkApiError,
} from "../types/index.js";
import { CardanoAmounts, CardanoConstants } from "../index.js";
import * as CardanoWasm from "@emurgo/cardano-serialization-lib-nodejs";

/** Raw CBOR array - used for hand-built Cardano transaction structures */
export type CborArray = unknown[];

// credential must be 28 bytes per Conway CDDL
const CREDENTIAL_LEN = 28;
const assertCredLen = (buf: Buffer, ctx: string) => {
  if (buf.length !== CREDENTIAL_LEN) {
    throw new SdkApiError(
      `${ctx}: credential must be ${CREDENTIAL_LEN} bytes, got ${buf.length}`,
      400,
      "ValidationError",
      { context: ctx, expectedBytes: CREDENTIAL_LEN, actualBytes: buf.length },
      "staking-service"
    );
  }
};

/**
 * Blake2b hash with configurable digest size (default 28 bytes for address hash, 32 for TX hash)
 */
export const blakeHash = (payload: Buffer, digestSize: number = 28): Buffer => {
  const hash = blake2b(payload, undefined, digestSize);
  return Buffer.from(hash);
};

/**
 * Calculate transaction hash for signing (32 byte Blake2b hash)
 */
export const getSigningPayload = (serializedTx: Buffer): Buffer => {
  return blakeHash(serializedTx, 32);
};

/**
 * Get stake address HRP (human readable part) based on network
 */
export const getStakeAddressHrp = (mainnet: boolean): string => {
  return mainnet ? "stake" : "stake_test";
};

/**
 * Get address HRP based on network
 */
export const getAddressHrp = (mainnet: boolean): string => {
  return mainnet ? "addr" : "addr_test";
};

/**
 * Get stake address bytes prefix based on network
 */
export const stakeAddressBytesPrefix = (mainnet: boolean): Buffer => {
  return Buffer.from([mainnet ? 0xe1 : 0xe0]);
};

/**
 * Encode stake address from bytes to bech32 format
 */
export const encodeStakeAddress = (decodedAddress: Buffer, mainnet: boolean): string => {
  const hrp = getStakeAddressHrp(mainnet);
  const words = bech32.toWords(decodedAddress);
  return bech32.encode(hrp, words);
};

/**
 * Decode Cardano address from bech32 to bytes
 */
export const decodeAddress = (encodedAddress: string, mainnet: boolean): Buffer => {
  const expectedHrp = getAddressHrp(mainnet);

  if (!encodedAddress.startsWith(`${expectedHrp}1`)) {
    throw new SdkApiError(
      `Address ${encodedAddress} is invalid (use Shelley-era addresses with ${expectedHrp} prefix)`,
      400,
      "InvalidAddress",
      { encodedAddress, expectedHrp },
      "staking-service"
    );
  }

  // Use a higher limit (1000) to accommodate Cardano addresses
  const decoded = bech32.decode(encodedAddress, 1000);
  const addressBytes = Buffer.from(bech32.fromWords(decoded.words));
  return addressBytes;
};

/**
 * Extract stake credential (last 28 bytes) from a base address
 */
export const getCertificateFromBaseAddress = (baseAddress: string, mainnet: boolean): Buffer => {
  const decoded = decodeAddress(baseAddress, mainnet);

  if (decoded.length < CardanoConstants.CARDANO_BASE_ADDRESS_MIN_LENGTH) {
    throw new SdkApiError(
      `Invalid base address length: ${decoded.length}, expected at least ${CardanoConstants.CARDANO_BASE_ADDRESS_MIN_LENGTH} bytes`,
      400,
      "InvalidAddress",
      { actualLength: decoded.length, minLength: CardanoConstants.CARDANO_BASE_ADDRESS_MIN_LENGTH },
      "staking-service"
    );
  }

  // Extract stake credential (last 28 bytes)
  return decoded.subarray(CardanoConstants.CARDANO_PAYMENT_CREDENTIAL_OFFSET);
};

/**
 * Get stake address from certificate (credential hash)
 */
export const getStakeAddressFromCertificate = (certificate: Buffer, mainnet: boolean): string => {
  const prefix = stakeAddressBytesPrefix(mainnet);
  const fullAddress = Buffer.concat([prefix, certificate]);
  return encodeStakeAddress(fullAddress, mainnet);
};

/**
 * Get stake address from base address
 */
export const getStakeAddressFromBaseAddress = (baseAddress: string, mainnet: boolean): string => {
  const certificate = getCertificateFromBaseAddress(baseAddress, mainnet);
  return getStakeAddressFromCertificate(certificate, mainnet);
};

/**
 * Convert Buffer to Uint8Array for CBOR encoding
 */
const toUint8Array = (buffer: Buffer): Uint8Array => {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

/**
 * Serialize certificate for CBOR encoding
 * Returns [0, certificate] array
 */
export const serializeCertificate = (certificate: Buffer): [number, Uint8Array] => {
  const certBuffer = Buffer.isBuffer(certificate) ? certificate : Buffer.from(certificate, "hex");

  return [0, toUint8Array(certBuffer)];
};

/**
 * Build stake key registration certificate (Shelley era)
 * Certificate type: 0 (STAKE_KEY_REGISTRATION) - no deposit field
 * Note: Conway-era registration (type 7, with deposit) is not used here;
 * Shelley-era certs remain valid on the Conway ledger.
 */
export const buildRegistrationCertificate = (credential: Buffer): CardanoCertificate => {
  assertCredLen(credential, "buildRegistrationCertificate");
  const serializedCert = serializeCertificate(credential);

  return [
    CertificateType.STAKE_KEY_REGISTRATION, // Type 0 (Shelley)
    serializedCert, // [0, credential_buffer]
  ];
};

/**
 * Build stake key deregistration certificate (Shelley era)
 * Certificate type: 1 (STAKE_KEY_DEREGISTRATION) - no refund field
 * Note: Conway-era deregistration (type 8, with refund) is not used here;
 * Shelley-era certs remain valid on the Conway ledger.
 */
export const buildDeregistrationCertificate = (credential: Buffer): CardanoCertificate => {
  assertCredLen(credential, "buildDeregistrationCertificate");
  const serializedCert = serializeCertificate(credential);
  return [
    CertificateType.STAKE_KEY_DEREGISTRATION, // Type 1 (Shelley)
    serializedCert,
  ];
};

/**
 * Build pool delegation certificate
 */
export const buildDelegationCertificate = (
  credential: Buffer,
  poolId: string
): CardanoWasm.Certificate => {
  assertCredLen(credential, "buildDelegationCertificate");

  // WASM handles must be freed even when a decode throws mid-build.
  let credentialHash: CardanoWasm.Ed25519KeyHash | null = null;
  let stakeCredential: CardanoWasm.Credential | null = null;
  let poolKeyHash: CardanoWasm.Ed25519KeyHash | null = null;
  let stakeDelegation: CardanoWasm.StakeDelegation | null = null;
  try {
    credentialHash = CardanoWasm.Ed25519KeyHash.from_bytes(credential);
    stakeCredential = CardanoWasm.Credential.from_keyhash(credentialHash);

    // Handle both bech32 (pool1...) and hex formats
    let poolIdHex: string;
    if (poolId.startsWith("pool")) {
      // Decode bech32 pool ID to hex
      const decoded = bech32.decode(poolId, 1000);
      const words = decoded.words;
      const bytes = bech32.fromWords(words);
      poolIdHex = Buffer.from(bytes).toString("hex");
    } else {
      // Already in hex format
      poolIdHex = poolId;
    }

    poolKeyHash = CardanoWasm.Ed25519KeyHash.from_hex(poolIdHex);
    stakeDelegation = CardanoWasm.StakeDelegation.new(stakeCredential, poolKeyHash);
    return CardanoWasm.Certificate.new_stake_delegation(stakeDelegation);
  } finally {
    stakeDelegation?.free();
    poolKeyHash?.free();
    stakeCredential?.free();
    credentialHash?.free();
  }
};

/**
 * Build vote delegation certificate (Conway era)
 */
export const buildVoteDelegationCertificate = (credential: Buffer, drep: DRepInfo): CborArray => {
  assertCredLen(credential, "buildVoteDelegationCertificate");
  // Stake credential: [0, credential_bytes]
  const stakeCredential = [0, toUint8Array(credential)];

  let drepValue: CborArray;

  switch (drep.kind) {
    case DRepKind.ALWAYS_ABSTAIN:
    case DRepKind.ALWAYS_NO_CONFIDENCE:
      // Singleton DRep types: CBOR index is the enum value itself (2 or 3)
      drepValue = [drep.kind];
      break;
    case DRepKind.KEY_HASH:
      if (!drep.keyHash) {
        throw new SdkApiError(
          "KEY_HASH DRep requires keyHash",
          400,
          "ValidationError",
          { drepKind: drep.kind },
          "staking-service"
        );
      }
      assertCredLen(drep.keyHash, "DRep keyHash");
      // [kind, key_hash] - kind = 0
      drepValue = [drep.kind, toUint8Array(drep.keyHash)];
      break;
    case DRepKind.SCRIPT_HASH:
      if (!drep.keyHash) {
        throw new SdkApiError(
          "SCRIPT_HASH DRep requires keyHash",
          400,
          "ValidationError",
          { drepKind: drep.kind },
          "staking-service"
        );
      }
      assertCredLen(drep.keyHash, "DRep scriptHash");
      // [kind, script_hash] - kind = 1
      drepValue = [drep.kind, toUint8Array(drep.keyHash)];
      break;
    default:
      throw new SdkApiError(
        `Unknown DRep kind: ${drep.kind}`,
        400,
        "ValidationError",
        { drepKind: drep.kind },
        "staking-service"
      );
  }

  // Return: [9, [0, credential], drep_value]
  return [9, stakeCredential, drepValue];
};

/**
 * Convert a lovelace amount to BigInt for CBOR encoding as an unsigned
 * integer (Cardano CDDL coin). Number inputs are rounded to the nearest
 * integer and must be finite, non-negative, and within the safe integer
 * range; BigInt inputs must be non-negative. BigInt carries amounts
 * above 2^53 exactly.
 */
export const toCoinBigInt = (value: number | bigint, label: string): bigint => {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${label} must be a non-negative lovelace amount, got ${value}`);
    }
    return value;
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite lovelace amount, got ${value}`);
  }
  const rounded = Math.round(value);
  if (rounded < 0) {
    throw new Error(`${label} must be a non-negative lovelace amount, got ${value}`);
  }
  if (!Number.isSafeInteger(rounded)) {
    throw new Error(
      `${label} exceeds the JS safe integer range (2^53); pass the amount as a BigInt`
    );
  }
  return BigInt(rounded);
};

/**
 * Serialize withdrawals as a map for CBOR encoding.
 * Rewards are carried as BigInt so cbor2 emits CBOR unsigned ints
 * without JS Number (53-bit) precision loss.
 */
export const serializeWithdrawals = (withdrawals: CardanoRewardWithdrawal[]): WithdrawalMap => {
  const withdrawalMap: WithdrawalMap = new Map();
  for (const withdrawal of withdrawals) {
    withdrawalMap.set(
      toUint8Array(withdrawal.certificate),
      toCoinBigInt(withdrawal.reward, "withdrawal reward")
    );
  }
  return withdrawalMap;
};

/**
 * Embed signatures in transaction to create final signed transaction
 * Witnesses are automatically sorted by key hash as required by Cardano
 */
export const embedSignaturesInTx = (
  deserializedTxPayload: Map<number, unknown>,
  signatures: CardanoWitness[]
): Buffer => {
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
};

/**
 * Build transaction payload (transaction body) for CBOR encoding
 */
export const buildPayload = (
  options: BuildPayloadOptions
): {
  serialized: Buffer;
  deserialized: Map<number, unknown>;
} => {
  const { toAddress, txInputs, ttl, certificates, withdrawals, votingProcedures, network } =
    options;

  // Encode lovelace amounts as BigInt so cbor2 emits CBOR unsigned ints
  // (major type 0) without risking JS Number (53-bit) precision loss.
  const netAmount = toCoinBigInt(options.netAmount, "netAmount");
  const feeAmount = toCoinBigInt(options.feeAmount, "feeAmount");

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
  const deserialized = new Map<number, unknown>();

  deserialized.set(0, inputsArr); // inputs
  deserialized.set(1, outputsArr); // outputs
  deserialized.set(2, feeAmount); // fee

  // TTL (invalid_hereafter) - optional, only include if provided
  if (ttl !== undefined && ttl !== null) {
    deserialized.set(3, ttl);
  }

  // Optional fields - add in numerical order
  if (certificates && certificates.length > 0) {
    const certsArr = certificates.map((cert: unknown) => {
      // If it's already an array (manual certificate), use it directly
      if (Array.isArray(cert)) {
        return cert;
      }
      // If it's a CSL Certificate object, decode it
      if (
        cert !== null &&
        typeof cert === "object" &&
        "to_bytes" in cert &&
        typeof (cert as { to_bytes: unknown }).to_bytes === "function"
      ) {
        const certBytes = (cert as { to_bytes: () => Uint8Array }).to_bytes();
        return decode(certBytes);
      }
      // Otherwise return as-is
      return cert;
    });
    deserialized.set(4, certsArr);
  }

  if (withdrawals && withdrawals.size > 0) {
    deserialized.set(5, withdrawals); // key 5 = withdrawals per Cardano ledger spec
  }

  if (votingProcedures && votingProcedures.size > 0) {
    deserialized.set(19, votingProcedures); // key 19 = voting_procedures (Conway era)
  }

  const serialized = Buffer.from(cborEncode(deserialized));

  return { serialized, deserialized };
};

/**
 * CBOR envelope overhead (bytes) added when the tx body is wrapped into a full
 * signed transaction `[body, witnessSet, true, null]`. Matches the margin used by
 * the transfer path's fee-convergence loop.
 */
const RAW_TX_ENVELOPE_OVERHEAD_BYTES = 10;

/**
 * Computes the size-aware network minimum fee (`minFeeA * size + minFeeB`) for a
 * raw (staking/governance) transaction and asserts the allocated fee covers it.
 *
 * Unlike the transfer path, the raw path signs a hand-built CBOR body and never
 * re-derives the fee from the transaction size, so a caller-supplied fee that is
 * too low would pass a naive `positive integer` check, consume a Fireblocks
 * signing operation, and then be rejected by the node. This guard runs BEFORE
 * signing to prevent that.
 *
 * NOTE: MIN_FEE_A / MIN_FEE_B are protocol parameters — replace with dynamic
 * values once the parameter endpoint (audit finding H-04) is available.
 *
 * @param serializedBodySize - byte length of the CBOR-encoded transaction body
 * @param witnessCount - number of vkey witnesses added when signing (2 for staking/gov)
 * @param fee - fee (lovelace) allocated in the transaction body
 * @returns the computed minimum fee (lovelace)
 * @throws SdkApiError(400, "FeeBelowMinimum") if fee is below the floor
 */
export const assertFeeCoversSize = (
  serializedBodySize: number,
  witnessCount: number,
  fee: number
): number => {
  const estimatedSignedSize =
    serializedBodySize +
    witnessCount * CardanoConstants.TX_WITNESS_SIZE_BYTES +
    RAW_TX_ENVELOPE_OVERHEAD_BYTES;

  const minFee = CardanoConstants.MIN_FEE_A * estimatedSignedSize + CardanoConstants.MIN_FEE_B;

  if (fee < minFee) {
    throw new SdkApiError(
      `Fee ${fee} lovelace is below the network minimum of ${minFee} lovelace for this ` +
        `transaction (estimated signed size ${estimatedSignedSize} bytes). ` +
        `Increase the fee to at least ${minFee} lovelace.`,
      400,
      "FeeBelowMinimum",
      { fee, minFee, estimatedSignedSize, witnessCount },
      "staking-service"
    );
  }

  return minFee;
};

/**
 * Asserts a raw staking/governance transaction's change output (`netAmount`, the ADA
 * returned to the sender) meets the protocol min-UTxO. `buildPayload` always emits
 * exactly one output, and Cardano rejects any output below min-UTxO — so an underfunded
 * `netAmount` (e.g. a vault funded with almost exactly deposit+fee) would be rejected by
 * the node only AFTER a Fireblocks signing operation is spent. This guard runs before
 * signing and fails fast with an actionable 400 instead.
 */
export const assertOutputMeetsMinUtxo = (netAmount: number): void => {
  if (netAmount < CardanoConstants.MIN_UTXO_BASE_LOVELACE) {
    throw new SdkApiError(
      `Transaction change output of ${netAmount} lovelace is below the ` +
        `${CardanoConstants.MIN_UTXO_BASE_LOVELACE} lovelace protocol minimum (min-UTxO). ` +
        `Fund the address with additional ADA so the leftover after the deposit and fee ` +
        `clears the minimum.`,
      400,
      "BelowMinimumUtxo",
      { netAmount, minUtxo: CardanoConstants.MIN_UTXO_BASE_LOVELACE },
      "staking-service"
    );
  }
};

/**
 * Calculate TTL (time to live) for transaction
 */
export const calculateTtl = (
  currentSlot: number,
  ttlSecs: number = CardanoAmounts.TX_TTL_SECS
): number => {
  return currentSlot + ttlSecs;
};

/**
 * Find suitable UTXO for staking operations
 */
export interface UtxoForStaking {
  txHash: string;
  indexInTx: number;
  nativeAmount: number;
}

type IagonUtxoLike = {
  transaction_id: string;
  output_index: number;
  value: {
    lovelace: number;
    assets?: Record<string, number>;
  };
};

const isPureAda = (utxo: IagonUtxoLike): boolean =>
  !utxo.value.assets || Object.keys(utxo.value.assets).length === 0;

export const findSuitableUtxo = (
  utxos: IagonUtxoLike[],
  minAmount: number
): UtxoForStaking | null => {
  for (const utxo of utxos) {
    // Skip UTXOs that contain tokens - only use pure ADA UTXOs for staking
    if (isPureAda(utxo) && utxo.value.lovelace >= minAmount) {
      return {
        txHash: utxo.transaction_id,
        indexInTx: utxo.output_index,
        nativeAmount: utxo.value.lovelace,
      };
    }
  }
  return null;
};

/**
 * Aggregates pure-ADA (token-free) UTXOs from a single address, largest-first, until
 * their combined lovelace covers `minAmount`.
 *
 * Staking/governance transactions are signed with only the payment + stake witnesses,
 * so every input must come from the same address (one payment key). Selection is
 * therefore per-address. Returns the selected UTxOs and their running total, or `null`
 * if this address's pure-ADA UTxOs cannot cover `minAmount` (in aggregate) within the
 * `MAX_TX_INPUTS` cap. Largest-first keeps the input count — and thus the fee and tx
 * size — minimal.
 *
 * This lets a deposit (e.g. the 500 ADA DRep registration) be funded from several
 * UTxOs instead of requiring a single UTxO of the full amount (audit finding S-4).
 */
export const selectPureAdaUtxos = (
  utxos: IagonUtxoLike[],
  minAmount: number
): { utxos: UtxoForStaking[]; total: number } | null => {
  const pureAda = utxos
    .filter(isPureAda)
    .sort((a, b) => b.value.lovelace - a.value.lovelace);

  const selected: UtxoForStaking[] = [];
  let total = 0;
  for (const utxo of pureAda) {
    if (selected.length >= CardanoConstants.MAX_TX_INPUTS) break;
    selected.push({
      txHash: utxo.transaction_id,
      indexInTx: utxo.output_index,
      nativeAmount: utxo.value.lovelace,
    });
    total += utxo.value.lovelace;
    if (total >= minAmount) return { utxos: selected, total };
  }
  return null;
};

/**
 * Total lovelace held in this address's pure-ADA UTxOs. Used to produce actionable
 * error messages when no single address can cover a required amount.
 */
export const sumPureAdaLovelace = (utxos: IagonUtxoLike[]): number =>
  utxos.filter(isPureAda).reduce((sum, u) => sum + u.value.lovelace, 0);

/**
 * Decode DRep ID from bech32 or hex format
 * Bech32 format: drep1... or drep_script1...
 * Hex format: 28-byte hex string
 */
const DREP_CREDENTIAL_BYTES = 28; // Conway spec: DRep credentials are 28-byte hashes
const ANCHOR_DATA_HASH_BYTES = 32; // Conway spec: anchor data hash is blake2b-256 = 32 bytes
const ANCHOR_DATA_HASH_HEX_LEN = ANCHOR_DATA_HASH_BYTES * 2; // 64 hex chars

/**
 * Validate an anchor data hash per the Conway spec.
 * Must be exactly 32 bytes (64 hex characters).
 */
const validateAnchorDataHash = (dataHash: string): void => {
  if (!/^[0-9a-fA-F]{64}$/.test(dataHash)) {
    throw new SdkApiError(
      `Invalid anchor dataHash: must be exactly ${ANCHOR_DATA_HASH_HEX_LEN} hex characters (got "${dataHash.length}" chars)`,
      400,
      "ValidationError",
      { expectedHexLength: ANCHOR_DATA_HASH_HEX_LEN, actualLength: dataHash.length },
      "staking-service"
    );
  }
};

const decodeDRepId = (drepId: string): { keyHash: Buffer; isScript: boolean } => {
  // Bech32 forms accepted:
  //  - CIP-129: HRP "drep", 29-byte payload (header 0x22/0x23 + 28-byte hash)
  //  - CIP-105 legacy: HRP "drep" (key) or "drep_script" (script), 28-byte payload
  if (drepId.startsWith("drep1") || drepId.startsWith("drep_script1")) {
    const decoded = bech32.decode(drepId, 1000);
    const fullBytes = Buffer.from(bech32.fromWords(decoded.words));

    if (fullBytes.length === DREP_CREDENTIAL_BYTES + 1) {
      // CIP-129: HRP is always "drep"; the credential type lives in the
      // header byte, which must be exactly 0x22 (key hash) or 0x23
      // (script hash).
      if (decoded.prefix !== "drep") {
        throw new SdkApiError(
          `Invalid DRep ID: a ${DREP_CREDENTIAL_BYTES + 1}-byte CIP-129 payload requires HRP "drep", got "${decoded.prefix}"`,
          400,
          "ValidationError",
          { prefix: decoded.prefix },
          "staking-service"
        );
      }
      const header = fullBytes[0];
      if (header !== 0x22 && header !== 0x23) {
        throw new SdkApiError(
          `Invalid DRep ID: CIP-129 header byte must be 0x22 (key hash) or 0x23 (script hash), got 0x${header.toString(16).padStart(2, "0")}`,
          400,
          "ValidationError",
          { header },
          "staking-service"
        );
      }
      return { keyHash: Buffer.from(fullBytes.subarray(1)), isScript: header === 0x23 };
    }

    if (fullBytes.length === DREP_CREDENTIAL_BYTES) {
      // CIP-105: HRP distinguishes key vs script
      return { keyHash: fullBytes, isScript: decoded.prefix === "drep_script" };
    }

    throw new SdkApiError(
      `Invalid DRep ID: bech32 payload must be ${DREP_CREDENTIAL_BYTES} or ${DREP_CREDENTIAL_BYTES + 1} bytes, got ${fullBytes.length}`,
      400,
      "ValidationError",
      { actualBytes: fullBytes.length },
      "staking-service"
    );
  }

  // Hex format: must be exactly 56 hex characters (28 bytes)
  if (!/^[0-9a-fA-F]{56}$/.test(drepId)) {
    throw new SdkApiError(
      `Invalid DRep ID: hex format must be exactly ${DREP_CREDENTIAL_BYTES * 2} hex characters (${DREP_CREDENTIAL_BYTES} bytes), got length ${drepId.length}`,
      400,
      "ValidationError",
      { expectedHexLength: DREP_CREDENTIAL_BYTES * 2, actualLength: drepId.length },
      "staking-service"
    );
  }

  return { keyHash: Buffer.from(drepId, "hex"), isScript: false };
};

/**
 * Convert DRep action string to DRepInfo
 * Supports both bech32 (drep1...) and hex formats for custom DReps
 */
export const drepActionToDRepInfo = (action: DRepAction, drepId?: string): DRepInfo => {
  switch (action) {
    case DRepAction.ALWAYS_ABSTAIN:
      return { kind: DRepKind.ALWAYS_ABSTAIN };
    case DRepAction.ALWAYS_NO_CONFIDENCE:
      return { kind: DRepKind.ALWAYS_NO_CONFIDENCE };
    case DRepAction.CUSTOM_DREP: {
      if (!drepId) {
        throw new SdkApiError(
          "custom-drep requires drepId",
          400,
          "ValidationError",
          { action },
          "staking-service"
        );
      }

      const { keyHash, isScript } = decodeDRepId(drepId);

      return {
        kind: isScript ? DRepKind.SCRIPT_HASH : DRepKind.KEY_HASH,
        keyHash,
      };
    }
    default:
      throw new SdkApiError(
        `Unknown DRep action: ${action}`,
        400,
        "ValidationError",
        { action },
        "staking-service"
      );
  }
};

/**
 * Build voting_procedures map for a DRep governance vote (Conway era, TX body key 19)
 *
 * CBOR structure:
 *   { voter => { gov_action_id => voting_procedure } }
 *
 * Where:
 *   voter            = [2, drep_key_hash_bytes]         (Conway CDDL: tag 2 = drep_keyhash, flat 2-tuple)
 *   gov_action_id    = [tx_hash_bytes, index]
 *   voting_procedure = [vote, anchor_or_null]           (vote: 0=No, 1=Yes, 2=Abstain)
 *   anchor           = [url_string, data_hash_bytes]
 *
 * Conway voter tags (IntersectMBO/cardano-ledger conway.cddl):
 *   0 = committee_hot_keyhash
 *   1 = committee_hot_scripthash
 *   2 = drep_keyhash       ← this SDK
 *   3 = drep_scripthash
 *   4 = stake_pool_keyhash
 */
export const buildVotingProcedures = (
  credential: Buffer,
  governanceActionId: { txHash: string; index: number },
  vote: 0 | 1 | 2,
  anchor?: { url: string; dataHash: string }
): Map<CborArray, Map<CborArray, CborArray>> => {
  assertCredLen(credential, "buildVotingProcedures");
  const voterKey = [2, toUint8Array(credential)]; // DRep key-hash voter: flat [tag=2, hash_bytes]

  const txHashBytes = toUint8Array(Buffer.from(governanceActionId.txHash, "hex"));
  const govActionKey = [txHashBytes, governanceActionId.index];

  if (anchor) validateAnchorDataHash(anchor.dataHash);
  const anchorValue = anchor
    ? [anchor.url, toUint8Array(Buffer.from(anchor.dataHash, "hex"))]
    : null;
  const votingProcedure = [vote, anchorValue];

  const govActionMap = new Map([[govActionKey, votingProcedure]]);
  return new Map([[voterKey, govActionMap]]);
};

/**
 * Build DRep registration certificate (Conway era, cert type 16)
 * CBOR structure: [16, [0, credential_bytes], coin_deposit, anchor_or_null]
 * where anchor = [url_string, data_hash_bytes] if provided
 */
export const buildDRepRegistrationCertificate = (
  credential: Buffer,
  depositLovelace: number | bigint,
  anchor?: { url: string; dataHash: string }
): CborArray => {
  assertCredLen(credential, "buildDRepRegistrationCertificate");
  if (anchor) validateAnchorDataHash(anchor.dataHash);
  const drepCredential = [0, toUint8Array(credential)];
  const anchorValue = anchor
    ? [anchor.url, toUint8Array(Buffer.from(anchor.dataHash, "hex"))]
    : null;
  return [16, drepCredential, toCoinBigInt(depositLovelace, "DRep deposit"), anchorValue];
};

/**
 * Encode a stake credential as a CIP-129 DRep ID.
 * Per CIP-129 the HRP is always "drep"; the type is encoded in the leading
 * header byte (0x22 = key-hash, 0x23 = script-hash).
 */
export const encodeDRepId = (credential: Buffer, isScript: boolean = false): string => {
  const header = Buffer.from([isScript ? 0x23 : 0x22]);
  const fullBytes = Buffer.concat([header, credential]);
  const words = bech32.toWords(fullBytes);
  return bech32.encode("drep", words, 1000);
};

/**
 * Sort witnesses by public key hash in lexicographic order
 * Cardano requires witnesses to be sorted for transaction validation
 */
export const sortWitnesses = (witnesses: CardanoWitness[]): CardanoWitness[] => {
  return witnesses.slice().sort((a, b) => {
    const hashA = blakeHash(a.pubKey, 28);
    const hashB = blakeHash(b.pubKey, 28);
    return hashA.compare(hashB);
  });
};
