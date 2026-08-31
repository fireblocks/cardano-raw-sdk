import { describe, it, expect, jest } from "@jest/globals";
import { IagonApiService } from "../../services/iagon.api.service.js";
import { Networks } from "../../types/index.js";

// The pool-retirement gate keys on data.status / data.retiring_epoch.
// getPoolInfo must validate those fields at runtime so a contract
// change fails loudly instead of silently disabling the gate.

const POOL_ID = "pool1vvkurfxhajtj4f7x8wjkeet7rg8amz34duy5nux76per5sn3npx";

const validPoolData = {
  pool_id: POOL_ID,
  hex: "63".repeat(28),
  vrf_key: "aa".repeat(32),
  blocks_minted: 10,
  blocks_epoch: 1,
  live_stake: "1000000",
  live_size: 0.001,
  live_saturation: 0.5,
  live_delegators: 3,
  active_stake: "1000000",
  active_size: 0.001,
  declared_pledge: "500000",
  live_pledge: "500000",
  margin_cost: 0.02,
  fixed_cost: "340000000",
  reward_account: "stake_test1uphwkmvv5j5nc2xmkp2etgfwzgezjdvzdc7m6s26d726uwgkdk9gu",
  owners: [],
  registration: [],
  status: "active",
  retiring_epoch: null,
};

const makeService = (payload: unknown): IagonApiService => {
  const service = new IagonApiService("test-key", Networks.PREPROD);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (service as any).axiosInstance = {
    get: jest.fn(async () => ({ status: 200, data: payload })),
  };
  return service;
};

describe("getPoolInfo - runtime contract validation", () => {
  it("returns the full payload for a valid response", async () => {
    const service = makeService({ success: true, data: validPoolData });
    const result = await service.getPoolInfo(POOL_ID);
    expect(result.data.status).toBe("active");
    // Fields outside the validated subset pass through unstripped.
    expect(result.data.live_stake).toBe("1000000");
  });

  it("throws when the status field is missing from the response", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status: _status, ...withoutStatus } = validPoolData;
    const service = makeService({ success: true, data: withoutStatus });
    await expect(service.getPoolInfo(POOL_ID)).rejects.toThrow(/status/i);
  });

  it("throws when status carries an unknown value", async () => {
    const service = makeService({
      success: true,
      data: { ...validPoolData, status: "decommissioned" },
    });
    await expect(service.getPoolInfo(POOL_ID)).rejects.toThrow(/status/i);
  });

  it("throws when retiring_epoch has a non-numeric type", async () => {
    const service = makeService({
      success: true,
      data: { ...validPoolData, status: "retiring", retiring_epoch: "310" },
    });
    await expect(service.getPoolInfo(POOL_ID)).rejects.toThrow(/retiring_epoch/i);
  });

  it("accepts a response without data so pool-not-found handling is preserved", async () => {
    const service = makeService({ success: false });
    const result = await service.getPoolInfo(POOL_ID);
    expect(result.data).toBeUndefined();
  });
});
