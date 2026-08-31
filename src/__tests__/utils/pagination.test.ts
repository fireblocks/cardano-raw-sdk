import { describe, it, expect } from "@jest/globals";
import { collectAllPages, PaginatedPage } from "../../utils/pagination.js";

// Shared paginator (audit finding M-14): advances offset by rows returned, honors
// pagination.hasMore, treats a short page as terminal only when metadata is absent,
// stops on an empty page, and fails loud on a failed page.

type Row = { id: number };

const rows = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: from + i }));

const failLoud = ({ offset }: { offset: number; page: number }): never => {
  throw new Error(`page failed at offset ${offset}`);
};

describe("collectAllPages", () => {
  it("walks all pages until hasMore === false and concatenates data in order", async () => {
    const pages: PaginatedPage<Row>[] = [
      { success: true, data: rows(0, 100), pagination: { hasMore: true } },
      { success: true, data: rows(100, 100), pagination: { hasMore: true } },
      { success: true, data: rows(200, 40), pagination: { hasMore: false } },
    ];
    const seen: number[] = [];
    const result = await collectAllPages<Row>(
      (offset) => {
        seen.push(offset);
        return Promise.resolve(pages.shift()!);
      },
      { onPageFailure: failLoud }
    );
    expect(result).toHaveLength(240);
    expect(result[0].id).toBe(0);
    expect(result[239].id).toBe(239);
    // Offset advances by rows actually returned.
    expect(seen).toEqual([0, 100, 200]);
  });

  it("advances offset by rows returned even on a short page when hasMore === true", async () => {
    // A short page (60 < 100) with hasMore=true must continue, and the next offset must
    // be startOffset + rowsReturned (60), not + pageSize (100).
    const offsets: number[] = [];
    const result = await collectAllPages<Row>(
      (offset) => {
        offsets.push(offset);
        if (offset === 0) {
          return Promise.resolve({ success: true, data: rows(0, 60), pagination: { hasMore: true } });
        }
        return Promise.resolve({ success: true, data: rows(60, 10), pagination: { hasMore: false } });
      },
      { onPageFailure: failLoud }
    );
    expect(offsets).toEqual([0, 60]);
    expect(result).toHaveLength(70);
  });

  it("treats a short page as terminal ONLY when pagination metadata is absent", async () => {
    const result = await collectAllPages<Row>(
      (offset) => {
        if (offset === 0) {
          // No pagination field at all → a short page (<pageSize) ends the walk.
          return Promise.resolve({ success: true, data: rows(0, 40) });
        }
        throw new Error("should not fetch a second page");
      },
      { onPageFailure: failLoud }
    );
    expect(result).toHaveLength(40);
  });

  it("stops on an empty page (cannot advance the offset)", async () => {
    let calls = 0;
    const result = await collectAllPages<Row>(
      () => {
        calls++;
        return Promise.resolve({ success: true, data: [], pagination: { hasMore: true } });
      },
      { onPageFailure: failLoud }
    );
    expect(result).toHaveLength(0);
    expect(calls).toBe(1);
  });

  it("fails loud via onPageFailure when a page reports success === false", async () => {
    await expect(
      collectAllPages<Row>(
        () => Promise.resolve({ success: false, data: rows(0, 100), pagination: { hasMore: true } }),
        { onPageFailure: failLoud }
      )
    ).rejects.toThrow("page failed at offset 0");
  });

  it("propagates a thrown fetchPage error (fail-loud)", async () => {
    await expect(
      collectAllPages<Row>(
        () => Promise.reject(new Error("network down")),
        { onPageFailure: failLoud }
      )
    ).rejects.toThrow("network down");
  });

  it("honors startOffset", async () => {
    const offsets: number[] = [];
    await collectAllPages<Row>(
      (offset) => {
        offsets.push(offset);
        return Promise.resolve({ success: true, data: rows(offset, 10), pagination: { hasMore: false } });
      },
      { startOffset: 500, onPageFailure: failLoud }
    );
    expect(offsets).toEqual([500]);
  });

  it("stops at the maxPages safety bound and reports truncation via onMaxPages", async () => {
    let calls = 0;
    const capped: Array<{ pagesFetched: number; rowsCollected: number }> = [];
    const result = await collectAllPages<Row>(
      (offset) => {
        calls++;
        // Always full page + hasMore=true would loop forever without the cap.
        return Promise.resolve({
          success: true,
          data: rows(offset, 2),
          pagination: { hasMore: true },
        });
      },
      {
        pageSize: 2,
        maxPages: 5,
        onPageFailure: failLoud,
        onMaxPages: (ctx) => capped.push(ctx),
      }
    );
    expect(calls).toBe(5);
    expect(result).toHaveLength(10);
    // Truncation must be reported exactly once with the counts.
    expect(capped).toEqual([{ pagesFetched: 5, rowsCollected: 10 }]);
  });

  it("does NOT call onMaxPages on normal termination (stream exhausted within the cap)", async () => {
    let onMaxPagesCalls = 0;
    const result = await collectAllPages<Row>(
      (offset) => {
        if (offset === 0) {
          return Promise.resolve({ success: true, data: rows(0, 2), pagination: { hasMore: true } });
        }
        return Promise.resolve({ success: true, data: rows(2, 1), pagination: { hasMore: false } });
      },
      {
        pageSize: 2,
        maxPages: 5,
        onPageFailure: failLoud,
        onMaxPages: () => {
          onMaxPagesCalls++;
        },
      }
    );
    expect(result).toHaveLength(3);
    expect(onMaxPagesCalls).toBe(0);
  });

  it("does NOT call onMaxPages when the stream ends exactly on the last allowed page", async () => {
    // Edge: 3 full pages, and the 3rd (last allowed) page reports hasMore=false. The walk
    // reaches page index maxPages-1 but terminates normally there — not truncation.
    let onMaxPagesCalls = 0;
    const result = await collectAllPages<Row>(
      (offset) =>
        Promise.resolve({
          success: true,
          data: rows(offset, 2),
          // offsets 0 and 2 have more; the page at offset 4 (the 3rd) ends the stream.
          pagination: { hasMore: offset < 4 },
        }),
      {
        pageSize: 2,
        maxPages: 3,
        onPageFailure: failLoud,
        onMaxPages: () => {
          onMaxPagesCalls++;
        },
      }
    );
    expect(result).toHaveLength(6);
    expect(onMaxPagesCalls).toBe(0);
  });
});
