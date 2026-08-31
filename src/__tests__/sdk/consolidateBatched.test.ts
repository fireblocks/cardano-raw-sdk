import { describe, it, expect, jest } from "@jest/globals";
import { FireblocksCardanoRawSDK } from "../../FireblocksCardanoRawSDK.js";
import { SdkApiError } from "../../types/index.js";
import type { UtxoData } from "../../types/iagon/UTXOs.js";
import type { ConsolidateUtxosResult } from "../../types/iagon/general.js";

// A UTxO fetch failure between batches, or on the final metadata read,
// must not discard the result of batches that were already signed and
// submitted on-chain: the accumulated txHashes are returned with
// partialError set instead of throwing away evidence that funds moved.

const SENDER = "addr_test1vqspu9vpqa2eg5fn0u46vyng967w4a9jpu6zzxq82pdu6tc9yxk6k";
const TX_HASH = "bb".repeat(32);

const makeUtxo = (index: number, lovelace = 5_000_000): UtxoData => ({
  transaction_id: "cc".repeat(32),
  output_index: index,
  address: SENDER,
  value: { lovelace, assets: {} },
  datum_hash: null,
  script_hash: null,
  created_at: { slot_no: 1, header_hash: "dd".repeat(32) },
});

interface FakeIagon {
  getUtxosByAddress: jest.Mock;
  submitTransfer: jest.Mock;
}

/**
 * Build a bare SDK instance with only the collaborators the batched
 * consolidation path uses. Fireblocks signing is replaced by a stub
 * that returns a minimal Transaction-like object.
 */
const makeSdk = (iagon: FakeIagon) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = Object.create(FireblocksCardanoRawSDK.prototype) as any;
  sdk.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  sdk.iagonApiService = iagon;
  sdk.fetchCurrentTtl = jest.fn(async () => 999_999_999);
  sdk.signTransaction = jest.fn(async () => ({
    to_bytes: () => new Uint8Array([0x84, 0xa0, 0xa0, 0xf6, 0xf6]),
    free: jest.fn(),
  }));
  return sdk;
};

const runBatched = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any,
  { batchSize = 2, maxBatches = 3, minUtxoCount = 2 } = {}
): Promise<ConsolidateUtxosResult> =>
  sdk.consolidateBatched(SENDER, batchSize, maxBatches, minUtxoCount);

describe("consolidateBatched - partial result preservation on fetch failure", () => {
  it("returns submitted batches with partialError when the inter-batch re-fetch fails", async () => {
    const iagon: FakeIagon = {
      getUtxosByAddress: jest
        .fn()
        // batch 1 top fetch: enough UTxOs to consolidate
        .mockImplementationOnce(async () => ({
          success: true,
          data: [makeUtxo(0), makeUtxo(1), makeUtxo(2)],
        }))
        // batch 1 confirmation fetch: inputs #0/#1 gone -> confirmed immediately
        .mockImplementationOnce(async () => ({
          success: true,
          data: [makeUtxo(9)],
        }))
        // batch 2 top re-fetch (and any later call): transient API failure
        .mockImplementation(async () => {
          throw new SdkApiError("Iagon unavailable", 503, "UTXO_FETCH_ERROR");
        }),
      submitTransfer: jest.fn(async () => ({
        success: true,
        data: { txHash: TX_HASH },
      })),
    };
    const sdk = makeSdk(iagon);

    const result = await runBatched(sdk);

    expect(result.batches).toHaveLength(1);
    expect(result.txHash).toBe(TX_HASH);
    expect(result.partialError).toMatch(/UTXO|Iagon|fetch/i);
    expect(iagon.submitTransfer).toHaveBeenCalledTimes(1);
  });

  it("returns the full result with partialError when only the final metadata fetch fails", async () => {
    const iagon: FakeIagon = {
      getUtxosByAddress: jest
        .fn()
        // batch 1 top fetch: consolidate three UTxOs
        .mockImplementationOnce(async () => ({
          success: true,
          data: [makeUtxo(0), makeUtxo(1), makeUtxo(2)],
        }))
        // batch 1 confirmation fetch: inputs #0/#1/#2 gone -> confirmed immediately
        .mockImplementationOnce(async () => ({
          success: true,
          data: [makeUtxo(9)],
        }))
        // batch 2 top re-fetch: one UTxO left, loop ends cleanly
        .mockImplementationOnce(async () => ({
          success: true,
          data: [makeUtxo(9)],
        }))
        // final metadata fetch: transient API failure
        .mockImplementation(async () => {
          throw new SdkApiError("Iagon unavailable", 503, "UTXO_FETCH_ERROR");
        }),
      submitTransfer: jest.fn(async () => ({
        success: true,
        data: { txHash: TX_HASH },
      })),
    };
    const sdk = makeSdk(iagon);

    const result = await runBatched(sdk, { batchSize: 3 });

    expect(result.batches).toHaveLength(1);
    expect(result.txHash).toBe(TX_HASH);
    expect(result.utxosCombined).toBe(3);
    expect(result.partialError).toMatch(/final/i);
  });

  it("still throws when the first fetch fails and nothing was submitted", async () => {
    const iagon: FakeIagon = {
      getUtxosByAddress: jest.fn(async () => {
        throw new SdkApiError("Iagon unavailable", 503, "UTXO_FETCH_ERROR");
      }),
      submitTransfer: jest.fn(),
    };
    const sdk = makeSdk(iagon);

    await expect(runBatched(sdk)).rejects.toThrow(/Iagon unavailable|consolidation failed/i);
    expect(iagon.submitTransfer).not.toHaveBeenCalled();
  });
});
