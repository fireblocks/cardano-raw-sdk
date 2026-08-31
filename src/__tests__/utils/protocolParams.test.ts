import { describe, it, expect, jest, afterEach } from "@jest/globals";
import {
  getProtocolParams,
  setProtocolParams,
  resetProtocolParams,
  getDefaultProtocolParams,
} from "../../utils/protocolParams.js";

// The protocol parameter store is process-global: SDK instances pooled
// in one process share it, so a second instance overriding values a
// prior instance set must emit a warning instead of bleeding silently
// across tenants.

afterEach(() => {
  resetProtocolParams();
  jest.restoreAllMocks();
});

describe("setProtocolParams - process-global override visibility", () => {
  it("applies a partial override and keeps defaults for the rest", () => {
    setProtocolParams({ minFeeB: 200_000 });
    const params = getProtocolParams();
    expect(params.minFeeB).toBe(200_000);
    expect(params.minFeeA).toBe(getDefaultProtocolParams().minFeeA);
  });

  it("does not warn on the first override", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    setProtocolParams({ minFeeB: 200_000 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when a later override changes previously customized values", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    setProtocolParams({ minFeeB: 200_000 });
    setProtocolParams({ minFeeB: 300_000 });
    const warned = warnSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && /process-global|overrid/i.test(arg))
    );
    expect(warned).toBe(true);
  });

  it("does not warn when a later override repeats identical values", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    setProtocolParams({ minFeeB: 200_000 });
    setProtocolParams({ minFeeB: 200_000 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("reset restores defaults and clears the customized state", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    setProtocolParams({ minFeeB: 200_000 });
    resetProtocolParams();
    expect(getProtocolParams()).toEqual(getDefaultProtocolParams());
    setProtocolParams({ minFeeB: 300_000 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not let an explicit undefined field overwrite a previously set value", () => {
    setProtocolParams({ minFeeB: 200_000 });
    setProtocolParams({ minFeeA: 45, minFeeB: undefined });
    const params = getProtocolParams();
    expect(params.minFeeB).toBe(200_000);
    expect(params.minFeeA).toBe(45);
  });
});
