import { describe, it, expect, jest } from "@jest/globals";
import { UtxoProvider } from "../../services/staking/helpers/utxo-provider.helper.js";
import { SdkApiError, SupportedAssets } from "../../types/index.js";

// Audit finding S-4: staking/gov deposits must aggregate multiple pure-ADA UTxOs from a
// single address, and the "insufficient funds" path must distinguish fragmentation
// (vault has enough, split across addresses) from a genuine vault-wide shortfall.

const ADA = 1_000_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const utxo = (id: string, lovelace: number, assets: Record<string, number> = {}): any => ({
  transaction_id: id.padStart(64, "0"),
  output_index: 0,
  address: "addr_test1xyz",
  value: { lovelace, assets },
  datum_hash: null,
  script_hash: null,
  created_at: { slot_no: 1, header_hash: "hh" },
});

const addr = (name: string, index: number) => ({
  address: name,
  addressFormat: "BASE",
  bip44AddressIndex: index,
});

const makeProvider = (utxosByAddress: Record<string, ReturnType<typeof utxo>[]>) => {
  const fireblocksService = {
    getVaultAccountAddresses: jest.fn(async () =>
      Object.keys(utxosByAddress).map((a, i) => addr(a, i))
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const iagonApiService = {
    getUtxosByAddress: jest.fn(async (address: string) => ({
      success: true,
      data: utxosByAddress[address] ?? [],
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const networkConfig = { assetId: SupportedAssets.ADA_TEST } as never;
  const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;
  return new UtxoProvider(fireblocksService, iagonApiService, networkConfig, logger);
};

describe("UtxoProvider.findAddressWithSuitableUtxo (S-4)", () => {
  it("aggregates multiple pure-ADA UTxOs from one address and returns a lock release", async () => {
    const provider = makeProvider({
      addrA: [utxo("a1", 2 * ADA), utxo("a2", 5 * ADA), utxo("a3", 1 * ADA)],
    });

    const result = await provider.findAddressWithSuitableUtxo("vault0", 6 * ADA);

    expect(result.address).toBe("addrA");
    // Largest-first aggregation: 5 + 2 = 7 ADA in two UTxOs.
    expect(result.utxos).toHaveLength(2);
    expect(result.totalAmount).toBe(7 * ADA);
    expect(typeof result.release).toBe("function");
    result.release(); // free the lock for other tests
  });

  it("throws FRAGMENTED_PURE_ADA when the vault has enough ADA but split across addresses", async () => {
    const provider = makeProvider({
      addrB1: [utxo("b1", 3 * ADA)],
      addrB2: [utxo("b2", 3 * ADA)],
    });

    // Need 5 ADA: no single address covers it, but the vault total (6 ADA) does.
    await expect(provider.findAddressWithSuitableUtxo("vault0", 5 * ADA)).rejects.toMatchObject({
      errorType: "FRAGMENTED_PURE_ADA",
      statusCode: 400,
    });
  });

  it("throws INSUFFICIENT_PURE_ADA when the whole vault lacks enough pure ADA", async () => {
    const provider = makeProvider({
      addrC1: [utxo("c1", 1 * ADA)],
      addrC2: [utxo("c2", 1 * ADA)],
    });

    // Need 5 ADA; vault holds only 2 ADA total -> shortfall, NOT fragmentation.
    let thrown: unknown;
    try {
      await provider.findAddressWithSuitableUtxo("vault0", 5 * ADA);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SdkApiError);
    expect((thrown as SdkApiError).errorType).toBe("INSUFFICIENT_PURE_ADA");
    expect((thrown as SdkApiError).statusCode).toBe(400);
    // Message must NOT tell the user to consolidate when they simply lack funds.
    expect((thrown as SdkApiError).message.toLowerCase()).not.toContain("consolidate");
  });

  it("ignores token-bearing UTxOs when assessing pure-ADA sufficiency", async () => {
    const provider = makeProvider({
      addrD: [utxo("d1", 100 * ADA, { "policy.TOKEN": 5 }), utxo("d2", 1 * ADA)],
    });

    // 100 ADA is locked behind tokens; only 1 ADA is pure -> insufficient for 5 ADA.
    await expect(provider.findAddressWithSuitableUtxo("vault0", 5 * ADA)).rejects.toMatchObject({
      errorType: "INSUFFICIENT_PURE_ADA",
    });
  });

  it("reports over-fragmentation (not a contradictory message) when ONE address has enough ADA but across too many UTxOs", async () => {
    // 300 pure-ADA UTxOs of 1 ADA on a single address = 300 ADA total, but covering 200 ADA
    // would need 200 inputs (> MAX_TX_INPUTS 100), so selection fails despite sufficiency.
    const many = Array.from({ length: 300 }, (_, i) => utxo(`u${i}`, 1 * ADA));
    const provider = makeProvider({ addrE: many });

    let thrown: unknown;
    try {
      await provider.findAddressWithSuitableUtxo("vault0", 200 * ADA);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SdkApiError);
    expect((thrown as SdkApiError).errorType).toBe("FRAGMENTED_PURE_ADA");
    const msg = (thrown as SdkApiError).message;
    // Must describe the real cause (too many UTxOs on one address), not the contradictory
    // "no single address holds enough" wording.
    expect(msg).toMatch(/too many|more than 100 UTxOs/i);
    expect(msg.toLowerCase()).toContain("consolidate");
    expect(msg.toLowerCase()).not.toContain("no single address");
  });
});
