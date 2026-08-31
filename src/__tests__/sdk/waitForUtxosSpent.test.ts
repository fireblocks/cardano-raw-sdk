import { describe, it, expect, jest } from "@jest/globals";
import { FireblocksCardanoRawSDK } from "../../FireblocksCardanoRawSDK.js";
import { SdkApiError } from "../../types/index.js";
import type { UtxoData } from "../../types/iagon/UTXOs.js";

// waitForUtxosSpent must survive transient read failures during confirmation: a thrown
// fetch is inconclusive and the loop retries until the deadline, rather than propagating
// (which would abort consolidation and release the lock on still-in-flight inputs). It
// must also never mistake indexer lag (empty set / inputs still present) for a spend.

const ADDR = "addr_test1vqspu9vpqa2eg5fn0u46vyng967w4a9jpu6zzxq82pdu6tc9yxk6k";

const makeUtxo = (index: number): UtxoData => ({
  transaction_id: "cc".repeat(32),
  output_index: index,
  address: ADDR,
  value: { lovelace: 5_000_000, assets: {} },
  datum_hash: null,
  script_hash: null,
  created_at: { slot_no: 1, header_hash: "dd".repeat(32) },
});

const okPage = (data: UtxoData[]) => ({ success: true, data });

const makeSdk = (getUtxosByAddress: jest.Mock) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = Object.create(FireblocksCardanoRawSDK.prototype) as any;
  sdk.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  sdk.iagonApiService = { getUtxosByAddress };
  return sdk;
};

// Short timeout/poll so the retry loop runs in milliseconds, not the 180s default.
const TIMEOUT_MS = 120;
const POLL_MS = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (sdk: any, spent: UtxoData[]) =>
  sdk.waitForUtxosSpent(ADDR, spent, TIMEOUT_MS, POLL_MS) as Promise<boolean>;

describe("waitForUtxosSpent - transient-error retry semantics", () => {
  it("retries on a thrown fetch and returns false at the deadline WITHOUT propagating", async () => {
    const getUtxos = jest.fn(async () => {
      throw new SdkApiError("Iagon unavailable", 503, "UTXO_FETCH_ERROR");
    });
    const sdk = makeSdk(getUtxos);

    // Must resolve false (timeout) — never reject — even though every fetch throws.
    await expect(run(sdk, [makeUtxo(0)])).resolves.toBe(false);
    // It actually retried multiple times rather than aborting on the first throw.
    expect(getUtxos.mock.calls.length).toBeGreaterThan(1);
    expect(sdk.logger.debug).toHaveBeenCalled();
  });

  it("keeps polling through transient errors, then confirms once inputs are gone", async () => {
    const getUtxos = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw new SdkApiError("blip", 503, "UTXO_FETCH_ERROR");
      })
      .mockImplementationOnce(async () => {
        throw new SdkApiError("blip", 503, "UTXO_FETCH_ERROR");
      })
      // spent input #0 no longer present -> confirmed
      .mockImplementation(async () => okPage([makeUtxo(9)]));
    const sdk = makeSdk(getUtxos);

    await expect(run(sdk, [makeUtxo(0)])).resolves.toBe(true);
  });

  it("treats inputs still present, then an empty page, as inconclusive (not confirmed)", async () => {
    const getUtxos = jest
      .fn()
      // still present -> inconclusive
      .mockImplementationOnce(async () => okPage([makeUtxo(0)]))
      // empty set -> inconclusive (indexer lag; a real consolidation leaves an output)
      .mockImplementationOnce(async () => okPage([]))
      // finally gone -> confirmed
      .mockImplementation(async () => okPage([makeUtxo(9)]));
    const sdk = makeSdk(getUtxos);

    await expect(run(sdk, [makeUtxo(0)])).resolves.toBe(true);
    expect(getUtxos.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("confirms immediately when the inputs are already gone on the first poll", async () => {
    const getUtxos = jest.fn(async () => okPage([makeUtxo(9)]));
    const sdk = makeSdk(getUtxos);

    await expect(run(sdk, [makeUtxo(0)])).resolves.toBe(true);
    expect(getUtxos).toHaveBeenCalledTimes(1);
  });
});
