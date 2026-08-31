import { describe, it, expect } from '@jest/globals';
import { bech32 } from 'bech32';
import { encode as cborEncode } from 'cbor2';
import {
  buildPayload,
  serializeWithdrawals,
  buildDRepRegistrationCertificate,
  toCoinBigInt,
  drepActionToDRepInfo,
  selectPureAdaUtxos,
  sumPureAdaLovelace,
  assertFeeCoversSize,
  assertOutputMeetsMinUtxo,
} from '../../utils/staking.utils.js';
import { Networks, DRepAction, DRepKind, SdkApiError } from '../../types/index.js';
import { CardanoConstants } from '../../constants.js';

/**
 * Helper: build a syntactically valid Shelley-era preprod base address
 * (header 0x00 + 28-byte payment hash + 28-byte stake hash) so buildPayload
 * has a parseable target for the output.
 */
const makePreprodAddress = (): string => {
  const header = Buffer.from([0x00]);
  const payment = Buffer.alloc(28, 0x11);
  const stake = Buffer.alloc(28, 0x22);
  const fullBytes = Buffer.concat([header, payment, stake]);
  return bech32.encode('addr_test', bech32.toWords(fullBytes), 1000);
};

/**
 * Look for the exact CBOR byte sequence for an unsigned integer value
 * (major type 0). cbor2 emits the minimum-length form, and BigInt values
 * are encoded with the same major-type-0 layout as Numbers, so a successful
 * search proves the value was serialized as a CBOR unsigned int with full
 * precision.
 */
const cborUintBytes = (value: bigint): number[] => {
  if (value < 0n) throw new Error('expected unsigned');
  if (value < 24n) return [Number(value)];
  if (value < 256n) return [0x18, Number(value)];
  if (value < 65536n) return [0x19, Number(value >> 8n) & 0xff, Number(value) & 0xff];
  if (value < 0x1_0000_0000n) {
    return [
      0x1a,
      Number((value >> 24n) & 0xffn),
      Number((value >> 16n) & 0xffn),
      Number((value >> 8n) & 0xffn),
      Number(value & 0xffn),
    ];
  }
  // 8-byte form for >= 2^32
  const out = [0x1b];
  for (let i = 7n; i >= 0n; i--) {
    out.push(Number((value >> (i * 8n)) & 0xffn));
  }
  return out;
};

const bufferContainsSequence = (buf: Buffer, seq: number[]): boolean => {
  outer: for (let i = 0; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer;
    }
    return true;
  }
  return false;
};

// M-04: hand-built CBOR transaction body must encode lovelace and fee with
// full integer precision (no JS Number 53-bit truncation).
describe('buildPayload - M-04 BigInt lovelace/fee encoding', () => {
  const baseOptions = {
    toAddress: makePreprodAddress(),
    txInputs: [{ txHash: Buffer.alloc(32, 0xaa), indexInTx: 0 }],
    network: Networks.PREPROD,
  };

  it('encodes typical lovelace and fee as CBOR unsigned integers', () => {
    const { serialized } = buildPayload({
      ...baseOptions,
      netAmount: 2_000_000,
      feeAmount: 200_000,
    });

    expect(bufferContainsSequence(serialized, cborUintBytes(2_000_000n))).toBe(true);
    expect(bufferContainsSequence(serialized, cborUintBytes(200_000n))).toBe(true);
  });

  it('uses 8-byte CBOR uint encoding for lovelace > 2^32', () => {
    const big = 5_000_000_000n; // 5 billion lovelace = 5,000 ADA, > 2^32
    const { serialized } = buildPayload({
      ...baseOptions,
      netAmount: Number(big),
      feeAmount: 200_000,
    });

    const expected = cborUintBytes(big);
    expect(expected[0]).toBe(0x1b); // 8-byte uint header
    expect(bufferContainsSequence(serialized, expected)).toBe(true);
  });

  it('rounds fractional inputs to integers before BigInt conversion', () => {
    const { serialized } = buildPayload({
      ...baseOptions,
      netAmount: 1_500_000.6,
      feeAmount: 200_000.4,
    });

    expect(bufferContainsSequence(serialized, cborUintBytes(1_500_001n))).toBe(true);
    expect(bufferContainsSequence(serialized, cborUintBytes(200_000n))).toBe(true);
  });
});

// M-04 residual: the withdrawal amount (body key 5) and the DRep
// registration deposit are the remaining hand-built CBOR coins; both
// must encode as CBOR unsigned integers with full precision above the
// JS Number 53-bit ceiling.
describe('serializeWithdrawals - M-04 BigInt withdrawal encoding', () => {
  // Reward account: e1 header + 28-byte stake key hash (preprod: e0).
  const rewardAccount = Buffer.concat([Buffer.from([0xe1]), Buffer.alloc(28, 0x33)]);

  const baseOptions = {
    toAddress: makePreprodAddress(),
    txInputs: [{ txHash: Buffer.alloc(32, 0xaa), indexInTx: 0 }],
    network: Networks.PREPROD,
  };

  it('encodes a withdrawal above 2^53 with full precision (body key 5)', () => {
    const reward = 2n ** 53n + 1n; // not representable as a JS Number
    const withdrawals = serializeWithdrawals([{ certificate: rewardAccount, reward }]);
    const { serialized } = buildPayload({
      ...baseOptions,
      netAmount: 2_000_000,
      feeAmount: 200_000,
      withdrawals,
    });

    const expected = cborUintBytes(reward);
    expect(expected[0]).toBe(0x1b); // 8-byte uint form
    expect(bufferContainsSequence(serialized, expected)).toBe(true);
    // The reward account byte string (0x58 0x1d length prefix + 29 bytes)
    // must appear as the withdrawal map key.
    expect(bufferContainsSequence(serialized, [0x58, 0x1d, ...rewardAccount])).toBe(true);
  });

  it('encodes a typical Number reward compactly and exactly', () => {
    const withdrawals = serializeWithdrawals([{ certificate: rewardAccount, reward: 1_234_567 }]);
    const { serialized } = buildPayload({
      ...baseOptions,
      netAmount: 2_000_000,
      feeAmount: 200_000,
      withdrawals,
    });

    expect(bufferContainsSequence(serialized, cborUintBytes(1_234_567n))).toBe(true);
  });
});

// Every hand-built CBOR coin routes through toCoinBigInt, which rejects
// values that cannot be a valid Cardano coin (CDDL uint) before the
// transaction reaches Fireblocks for signing.
describe('toCoinBigInt - coin conversion guards', () => {
  it('passes BigInt values through, including above 2^53', () => {
    expect(toCoinBigInt(2n ** 53n + 1n, 'test')).toBe(2n ** 53n + 1n);
  });

  it('rounds fractional Number inputs', () => {
    expect(toCoinBigInt(1_500_000.6, 'test')).toBe(1_500_001n);
  });

  it('rejects NaN with an error naming the field', () => {
    expect(() => toCoinBigInt(NaN, 'withdrawal reward')).toThrow(/withdrawal reward.*finite/i);
  });

  it('rejects Infinity', () => {
    expect(() => toCoinBigInt(Infinity, 'test')).toThrow(/finite/i);
  });

  it('rejects negative Numbers', () => {
    expect(() => toCoinBigInt(-1, 'test')).toThrow(/non-negative/i);
  });

  it('rejects negative BigInts', () => {
    expect(() => toCoinBigInt(-1n, 'test')).toThrow(/non-negative/i);
  });

  it('rejects Number inputs beyond the safe integer range', () => {
    expect(() => toCoinBigInt(2 ** 53 + 2, 'test')).toThrow(/BigInt/);
  });
});

describe('buildDRepRegistrationCertificate - M-04 BigInt deposit encoding', () => {
  const credential = Buffer.alloc(28, 0x44);

  it('encodes a deposit above 2^53 with full precision', () => {
    const deposit = 2n ** 53n + 1n;
    const cert = buildDRepRegistrationCertificate(credential, deposit);
    const encoded = Buffer.from(cborEncode(cert));

    const expected = cborUintBytes(deposit);
    expect(expected[0]).toBe(0x1b);
    expect(bufferContainsSequence(encoded, expected)).toBe(true);
  });

  it('encodes the standard 500 ADA deposit as a CBOR unsigned integer', () => {
    const cert = buildDRepRegistrationCertificate(credential, 500_000_000);
    const encoded = Buffer.from(cborEncode(cert));

    expect(bufferContainsSequence(encoded, cborUintBytes(500_000_000n))).toBe(true);
  });
});

// M-11: a CIP-129 DRep ID (29-byte payload) must carry HRP "drep" and a
// header byte of exactly 0x22 (key hash) or 0x23 (script hash); any
// other 29-byte form is malformed and must be rejected, not decoded by
// the header's low bit.
describe('decodeDRepId via drepActionToDRepInfo - M-11 strict CIP-129 header', () => {
  const credential = Buffer.alloc(28, 0x55);

  const encodeDrep = (hrp: string, bytes: Buffer): string =>
    bech32.encode(hrp, bech32.toWords(bytes), 1000);

  const cip129 = (header: number, hrp = 'drep'): string =>
    encodeDrep(hrp, Buffer.concat([Buffer.from([header]), credential]));

  const decode = (id: string) => drepActionToDRepInfo(DRepAction.CUSTOM_DREP, id);

  it('decodes a CIP-129 key-hash ID (header 0x22)', () => {
    const info = decode(cip129(0x22));
    expect(info.kind).toBe(DRepKind.KEY_HASH);
    expect(info.keyHash?.equals(credential)).toBe(true);
  });

  it('decodes a CIP-129 script-hash ID (header 0x23)', () => {
    const info = decode(cip129(0x23));
    expect(info.kind).toBe(DRepKind.SCRIPT_HASH);
    expect(info.keyHash?.equals(credential)).toBe(true);
  });

  it('rejects a 29-byte payload with an arbitrary odd header (0x21)', () => {
    expect(() => decode(cip129(0x21))).toThrow(/header/i);
  });

  it('rejects a 29-byte payload with an arbitrary even header (0x20)', () => {
    expect(() => decode(cip129(0x20))).toThrow(/header/i);
  });

  it('rejects a 29-byte payload under the drep_script HRP', () => {
    expect(() => decode(cip129(0x23, 'drep_script'))).toThrow(/drep_script|CIP-129|HRP/i);
  });

  it('still decodes a CIP-105 legacy script ID (28-byte drep_script payload)', () => {
    const info = decode(encodeDrep('drep_script', credential));
    expect(info.kind).toBe(DRepKind.SCRIPT_HASH);
    expect(info.keyHash?.equals(credential)).toBe(true);
  });
});

// ── S-4: pure-ADA UTxO aggregation ────────────────────────────────────────────
const utxo = (id: number, lovelace: number, assets?: Record<string, number>) => ({
  transaction_id: `${id}`.padStart(64, '0'),
  output_index: id,
  value: { lovelace, ...(assets ? { assets } : {}) },
});

describe('selectPureAdaUtxos', () => {
  it('aggregates pure-ADA UTxOs largest-first until the amount is covered', () => {
    const result = selectPureAdaUtxos(
      [utxo(1, 2_000_000), utxo(2, 5_000_000), utxo(3, 1_000_000)],
      6_000_000
    );
    expect(result).not.toBeNull();
    // Largest-first: 5 ADA + 2 ADA = 7 ADA >= 6 ADA, in two UTxOs, stops early.
    expect(result!.utxos).toHaveLength(2);
    expect(result!.total).toBe(7_000_000);
    expect(result!.utxos[0].nativeAmount).toBe(5_000_000);
  });

  it('returns a single UTxO when one already covers the amount', () => {
    const result = selectPureAdaUtxos([utxo(1, 600_000_000), utxo(2, 1_000_000)], 500_000_000);
    expect(result!.utxos).toHaveLength(1);
    expect(result!.total).toBe(600_000_000);
  });

  it('skips token-bearing UTxOs (only pure ADA is eligible)', () => {
    const result = selectPureAdaUtxos(
      [utxo(1, 10_000_000, { 'policy.TOKEN': 5 }), utxo(2, 3_000_000)],
      2_000_000
    );
    expect(result!.utxos).toHaveLength(1);
    expect(result!.utxos[0].nativeAmount).toBe(3_000_000);
  });

  it('returns null when pure-ADA UTxOs cannot cover the amount in aggregate', () => {
    const result = selectPureAdaUtxos([utxo(1, 1_000_000), utxo(2, 1_000_000)], 5_000_000);
    expect(result).toBeNull();
  });

  it('returns null rather than exceed MAX_TX_INPUTS', () => {
    // Many tiny UTxOs that together are huge, but would need > MAX_TX_INPUTS inputs.
    const many = Array.from({ length: CardanoConstants.MAX_TX_INPUTS + 50 }, (_, i) => utxo(i, 1));
    const result = selectPureAdaUtxos(many, CardanoConstants.MAX_TX_INPUTS + 50);
    expect(result).toBeNull();
  });
});

describe('sumPureAdaLovelace', () => {
  it('sums only token-free UTxOs', () => {
    const total = sumPureAdaLovelace([
      utxo(1, 2_000_000),
      utxo(2, 3_000_000, { 'policy.T': 1 }),
      utxo(3, 4_000_000),
    ]);
    expect(total).toBe(6_000_000);
  });

  it('is zero for an empty or all-token set', () => {
    expect(sumPureAdaLovelace([])).toBe(0);
    expect(sumPureAdaLovelace([utxo(1, 9_000_000, { 'p.T': 1 })])).toBe(0);
  });
});

// ── S-7: size-aware fee floor + min-UTxO output guard ─────────────────────────
describe('assertFeeCoversSize', () => {
  it('returns the computed minimum when the fee covers it', () => {
    const bodySize = 300;
    const min =
      CardanoConstants.MIN_FEE_A * (bodySize + 2 * CardanoConstants.TX_WITNESS_SIZE_BYTES + 10) +
      CardanoConstants.MIN_FEE_B;
    // A generous fee passes and the helper returns the floor it computed.
    expect(assertFeeCoversSize(bodySize, 2, min + 100_000)).toBe(min);
  });

  it('throws a 400 FeeBelowMinimum when the fee is under the size-aware floor', () => {
    try {
      assertFeeCoversSize(300, 2, 1); // 1 lovelace is well below any real floor
      throw new Error('expected assertFeeCoversSize to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SdkApiError);
      expect((e as SdkApiError).statusCode).toBe(400);
      expect((e as SdkApiError).errorType).toBe('FeeBelowMinimum');
    }
  });
});

describe('assertOutputMeetsMinUtxo', () => {
  it('passes when the change output meets the protocol minimum', () => {
    expect(() =>
      assertOutputMeetsMinUtxo(CardanoConstants.MIN_UTXO_BASE_LOVELACE)
    ).not.toThrow();
  });

  it('throws a 400 BelowMinimumUtxo for a change output below the minimum', () => {
    try {
      assertOutputMeetsMinUtxo(CardanoConstants.MIN_UTXO_BASE_LOVELACE - 1);
      throw new Error('expected assertOutputMeetsMinUtxo to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SdkApiError);
      expect((e as SdkApiError).statusCode).toBe(400);
      expect((e as SdkApiError).errorType).toBe('BelowMinimumUtxo');
    }
  });

  it('throws for a zero-value output', () => {
    expect(() => assertOutputMeetsMinUtxo(0)).toThrow(SdkApiError);
  });
});
