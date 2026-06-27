import { describe, it, expect, beforeEach } from "vitest";
import { signState, verifyState } from "./oauthState";

beforeEach(() => {
  process.env.MP_OAUTH_STATE_SECRET = "test-state-secret";
});

describe("oauthState", () => {
  it("signs and verifies, recovering the tenantId", () => {
    const state = signState({ tenantId: "tenant_123" });
    expect(verifyState(state)).toEqual({ tenantId: "tenant_123" });
  });

  it("rejects a tampered state", () => {
    const state = signState({ tenantId: "tenant_123" });
    const tampered = state.replace("tenant_123", "tenant_999");
    expect(() => verifyState(tampered)).toThrow();
  });

  it("rejects an expired state", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const state = signState({ tenantId: "tenant_123" }, past);
    expect(() => verifyState(state)).toThrow(/expired/i);
  });
});
