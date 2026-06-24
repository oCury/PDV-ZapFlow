import { describe, it, expect } from "vitest";
import { mapMpErrorToOperatorMessage } from "./errors";
import { MpApiError } from "./client";

describe("mapMpErrorToOperatorMessage", () => {
  it("maps 409 to device-busy message", () => {
    const m = mapMpErrorToOperatorMessage(new MpApiError(409, "queued"));
    expect(m.code).toBe("DEVICE_BUSY");
    expect(m.message).toMatch(/ocupada/i);
  });
  it("maps 403 to integrator-not-registered config error", () => {
    const m = mapMpErrorToOperatorMessage(new MpApiError(403, "x"));
    expect(m.code).toBe("CONFIG");
  });
  it("maps network errors to offline", () => {
    const m = mapMpErrorToOperatorMessage(new TypeError("fetch failed"));
    expect(m.code).toBe("OFFLINE");
  });
  it("falls back to generic", () => {
    const m = mapMpErrorToOperatorMessage(new MpApiError(500, "boom"));
    expect(m.code).toBe("GENERIC");
  });
});
