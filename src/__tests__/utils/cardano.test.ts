import { describe, it, expect, jest } from "@jest/globals";
import { bech32 } from "bech32";
import {
  isSpendableUtxo,
  assertRecipientAddress,
  buildAdaTransactionWithCalculatedFee,
  filterSpendableUtxos,
  createTransactionInputs,
} from "../../utils/cardano.js";
import { Address } from "@emurgo/cardano-serialization-lib-nodejs";
import { UtxoData, Networks, SdkApiError } from "../../types/index.js";

const makeBaseAddress = (mainnet: boolean): string => {
  // Header byte 0x01 = base address, payment-key + stake-key.
  // Network nibble: 1 = mainnet, 0 = preprod.
  const header = Buffer.from([mainnet ? 0x01 : 0x00]);
  const payment = Buffer.alloc(28, 0x11);
  const stake = Buffer.alloc(28, 0x22);
  const hrp = mainnet ? "addr" : "addr_test";
  return bech32.encode(hrp, bech32.toWords(Buffer.concat([header, payment, stake])), 1000);
};

const makeUtxo = (overrides: Partial<UtxoData> = {}): UtxoData => ({
  transaction_id: "a".repeat(64),
  output_index: 0,
  address: "addr1qx",
  value: { lovelace: 1_500_000, assets: {} },
  datum_hash: null,
  script_hash: null,
  created_at: { slot_no: 0, header_hash: "b".repeat(64) },
  ...overrides,
});

// M-06: filter out UTxOs that cannot be spent with a simple Ed25519 witness.
describe("isSpendableUtxo (M-06)", () => {
  it("accepts a plain UTxO (no datum, no script)", () => {
    expect(isSpendableUtxo(makeUtxo())).toBe(true);
  });

  it("rejects a UTxO with a datum_hash", () => {
    expect(isSpendableUtxo(makeUtxo({ datum_hash: "c".repeat(64) }))).toBe(false);
  });

  it("rejects a UTxO with a script_hash", () => {
    expect(isSpendableUtxo(makeUtxo({ script_hash: "d".repeat(56) }))).toBe(false);
  });

  it("rejects a UTxO with both datum_hash and script_hash", () => {
    expect(
      isSpendableUtxo(
        makeUtxo({
          datum_hash: "c".repeat(64),
          script_hash: "d".repeat(56),
        })
      )
    ).toBe(false);
  });

  it("treats empty strings as falsy (no datum/script)", () => {
    // Defensive: although the API types use string | null, an empty string
    // also indicates "absent" and must still be spendable.
    expect(
      isSpendableUtxo(
        makeUtxo({
          datum_hash: "" as unknown as string | null,
          script_hash: "" as unknown as string | null,
        })
      )
    ).toBe(true);
  });
});

// M-02: recipientAddress must be a valid bech32 address on the SDK's network.
describe("assertRecipientAddress (M-02)", () => {
  it("accepts a mainnet address when SDK is on mainnet", () => {
    expect(() => assertRecipientAddress(makeBaseAddress(true), Networks.MAINNET)).not.toThrow();
  });

  it("accepts a preprod address when SDK is on preprod", () => {
    expect(() => assertRecipientAddress(makeBaseAddress(false), Networks.PREPROD)).not.toThrow();
  });

  it("rejects a mainnet address when SDK is on preprod", () => {
    expect(() => assertRecipientAddress(makeBaseAddress(true), Networks.PREPROD)).toThrow(
      SdkApiError
    );
  });

  it("rejects a preprod address when SDK is on mainnet", () => {
    expect(() => assertRecipientAddress(makeBaseAddress(false), Networks.MAINNET)).toThrow(
      SdkApiError
    );
  });

  it("rejects malformed bech32 with ValidationError", () => {
    try {
      assertRecipientAddress("addr1notreallyvalid", Networks.MAINNET);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SdkApiError);
      expect((err as SdkApiError).statusCode).toBe(400);
      expect((err as SdkApiError).errorType).toBe("ValidationError");
    }
  });

  it("rejects a non-cardano string with ValidationError", () => {
    expect(() => assertRecipientAddress("hello world", Networks.MAINNET)).toThrow(SdkApiError);
  });

  it("rejects a Byron-era address with a message naming the unsupported format", () => {
    // Fireblocks rejects Byron destinations platform-wide (INVALID_ADDRESS),
    // so the SDK rejects them up front; the error must name the actual
    // problem rather than calling a valid on-chain address invalid.
    const byronAddress = "Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAi";
    try {
      assertRecipientAddress(byronAddress, Networks.MAINNET);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SdkApiError);
      expect((err as SdkApiError).statusCode).toBe(400);
      expect((err as SdkApiError).message).toMatch(/Byron/i);
      expect((err as SdkApiError).message).toMatch(/not supported/i);
    }
  });

  it("returns descriptive error info for network mismatch", () => {
    try {
      assertRecipientAddress(makeBaseAddress(true), Networks.PREPROD);
      throw new Error("expected to throw");
    } catch (err) {
      const e = err as SdkApiError;
      expect(e.message).toMatch(/network mismatch/i);
      expect(e.errorInfo).toMatchObject({ expectedNetworkId: 0, actualNetworkId: 1 });
    }
  });
});

// The fee returned by the convergence loop must equal the fee encoded
// in the returned transaction body. The sensitive case is a change output
// near a CBOR integer-width boundary (2^32 lovelace, ~4295 ADA), where the
// coin encoding grows between iterations.
describe("buildAdaTransactionWithCalculatedFee - M-10 fee/body consistency", () => {
  const buildAt = (totalInputLovelace: number) => {
    const sender = Address.from_bech32(makeBaseAddress(false));
    const recipient = Address.from_bech32(makeBaseAddress(false));
    const utxo = makeUtxo({ value: { lovelace: totalInputLovelace, assets: {} } });
    const txInputs = createTransactionInputs([utxo]);
    const result = buildAdaTransactionWithCalculatedFee(
      {
        lovelaceAmount: 1_000_000,
        recipientAddress: recipient,
        senderAddress: sender,
        selectedUtxos: [utxo],
      },
      txInputs,
      1_000_000,
      1
    );
    sender.free();
    recipient.free();
    return result;
  };

  it("reported fee equals the fee encoded in the body (ordinary amounts)", () => {
    const { fee, txBody } = buildAt(10_000_000);
    expect(Number(txBody.fee().to_str())).toBe(fee);
  });

  it("reported fee equals the body fee when change crosses the 2^32 CBOR boundary", () => {
    // Change at the 200000 initial fee estimate sits just under 2^32; at the
    // converged (~168k) fee it crosses above, growing the coin encoding by
    // 4 bytes (+176 lovelace at minFeeA=44) - the divergence window.
    const totalInput = 2 ** 32 - 1_000 + 1_000_000 + 200_000;
    const { fee, txBody } = buildAt(totalInput);
    expect(Number(txBody.fee().to_str())).toBe(fee);
  });

  it("returns live outputs and body owned by the caller", () => {
    // The convergence loop frees its intermediate WASM handles; the
    // returned handles must remain usable. A freed handle throws on use.
    const { outputs, txBody } = buildAt(10_000_000);
    expect(txBody.to_bytes().length).toBeGreaterThan(0);
    for (const output of outputs) {
      const amount = output.amount();
      const coin = amount.coin();
      expect(Number(coin.to_str())).toBeGreaterThan(0);
      coin.free();
      amount.free();
    }
  });
});

// M-06: datum- or script-bearing UTxOs are excluded from selection on every
// path; when value is excluded the exclusion must be visible in the logs so
// a balance that transfers cannot reach is not silently stranded.
describe("filterSpendableUtxos (M-06)", () => {
  it("returns only spendable UTxOs", () => {
    const utxos = [
      makeUtxo(),
      makeUtxo({ datum_hash: "c".repeat(64) }),
      makeUtxo({ script_hash: "d".repeat(56) }),
    ];
    const result = filterSpendableUtxos(utxos, "test");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(utxos[0]);
  });

  it("warns with a count when UTxOs are excluded", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    filterSpendableUtxos([makeUtxo(), makeUtxo({ datum_hash: "c".repeat(64) })], "test");
    const warned = warnSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && /1 .*(excluded|datum|script)/i.test(arg))
    );
    expect(warned).toBe(true);
    warnSpy.mockRestore();
  });

  it("does not warn when every UTxO is spendable", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    filterSpendableUtxos([makeUtxo(), makeUtxo()], "test");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
