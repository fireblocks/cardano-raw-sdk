import { describe, it, expect, jest } from "@jest/globals";
import { FireblocksCardanoRawSDK } from "../../FireblocksCardanoRawSDK.js";

// Page aggregation must never report a partial result as complete: a
// failed page aborts the walk with an error, and a short page with
// pagination.hasMore=true continues instead of ending the stream.

type Row = { tx_hash: string; slot_no: number };

const row = (i: number): Row => ({ tx_hash: `${i}`.padStart(64, "0"), slot_no: i });
const rows = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => row(from + i));

const PAGE_SIZE = 100;

const makeSdk = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = Object.create(FireblocksCardanoRawSDK.prototype) as any;
  sdk.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return sdk;
};

const fetchAll = (
  fetchFn: (params: { address: string; limit?: number; offset?: number }) => Promise<{
    success: boolean;
    data?: Row[];
    pagination?: { limit: number; offset: number; total: number; hasMore: boolean };
  }>
) => makeSdk().fetchAllPagesForAddress(fetchFn, "addr_test1xyz", {});

describe("fetchAllPagesForAddress - pagination integrity", () => {
  it("aggregates full pages until hasMore is false", async () => {
    const pages = [
      {
        success: true,
        data: rows(0, PAGE_SIZE),
        pagination: { limit: PAGE_SIZE, offset: 0, total: 250, hasMore: true },
      },
      {
        success: true,
        data: rows(100, PAGE_SIZE),
        pagination: { limit: PAGE_SIZE, offset: 100, total: 250, hasMore: true },
      },
      {
        success: true,
        data: rows(200, 50),
        pagination: { limit: PAGE_SIZE, offset: 200, total: 250, hasMore: false },
      },
    ];
    const fetchFn = jest.fn(async () => pages.shift()!);

    const result = await fetchAll(fetchFn);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(250);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("throws when a mid-pagination page reports success=false", async () => {
    const pages = [
      {
        success: true,
        data: rows(0, PAGE_SIZE),
        pagination: { limit: PAGE_SIZE, offset: 0, total: 250, hasMore: true },
      },
      { success: false as const },
    ];
    const fetchFn = jest.fn(async () => pages.shift()!);

    await expect(fetchAll(fetchFn)).rejects.toThrow(/page|history/i);
  });

  it("continues past a short page when hasMore is true", async () => {
    const pages = [
      {
        success: true,
        data: rows(0, 40),
        pagination: { limit: PAGE_SIZE, offset: 0, total: 140, hasMore: true },
      },
      {
        success: true,
        data: rows(40, PAGE_SIZE),
        pagination: { limit: PAGE_SIZE, offset: 40, total: 140, hasMore: false },
      },
    ];
    const fetchFn = jest.fn(async () => pages.shift()!);

    const result = await fetchAll(fetchFn);

    expect(result.data).toHaveLength(140);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("stops on an empty page even when hasMore is true", async () => {
    // A zero-row page with hasMore=true is a server contract anomaly;
    // the walk must terminate rather than loop on the same offset.
    const anomalous = {
      success: true,
      data: [] as Row[],
      pagination: { limit: PAGE_SIZE, offset: 0, total: 100, hasMore: true },
    };
    const fetchFn = jest.fn(async () => anomalous);

    const result = await fetchAll(fetchFn);

    expect(result.data).toHaveLength(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("falls back to the short-page heuristic when pagination is absent", async () => {
    const pages = [
      { success: true, data: rows(0, PAGE_SIZE) },
      { success: true, data: rows(100, 30) },
    ];
    const fetchFn = jest.fn(async () => pages.shift()!);

    const result = await fetchAll(fetchFn);

    expect(result.data).toHaveLength(130);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("preserves single-page semantics when the caller pins a limit", async () => {
    const fetchFn = jest.fn(async () => ({
      success: true,
      data: rows(0, 10),
      pagination: { limit: 10, offset: 0, total: 300, hasMore: true },
    }));

    const sdk = makeSdk();
    const result = await sdk.fetchAllPagesForAddress(fetchFn, "addr_test1xyz", { limit: 10 });

    expect(result.data).toHaveLength(10);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
