import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ENTITLEMENTS,
  PLAN_LIMITS,
  planFromTenant,
  hasEntitlement,
  allowedKeys,
  seatLimit,
} from "./entitlements";

describe("entitlements config", () => {
  it("plan tiers are strictly nested: basic ⊂ pro ⊂ enterprise", () => {
    for (const k of PLAN_ENTITLEMENTS.basic) expect(PLAN_ENTITLEMENTS.pro.has(k)).toBe(true);
    for (const k of PLAN_ENTITLEMENTS.pro) expect(PLAN_ENTITLEMENTS.enterprise.has(k)).toBe(true);
  });
  it("only enterprise has multistore", () => {
    expect(hasEntitlement("enterprise", "multistore")).toBe(true);
    expect(hasEntitlement("pro", "multistore")).toBe(false);
    expect(hasEntitlement("basic", "multistore")).toBe(false);
  });
  it("payments.terminal is in every plan (table-stakes)", () => {
    for (const p of PLANS) expect(hasEntitlement(p, "payments.terminal")).toBe(true);
  });
  it("fiscal.nfce and whatsapp are Pro+ only", () => {
    expect(hasEntitlement("basic", "fiscal.nfce")).toBe(false);
    expect(hasEntitlement("pro", "fiscal.nfce")).toBe(true);
    expect(hasEntitlement("basic", "whatsapp")).toBe(false);
    expect(hasEntitlement("pro", "whatsapp")).toBe(true);
  });
  it("planFromTenant normalizes null/unknown to basic (fail-closed)", () => {
    expect(planFromTenant(null)).toBe("basic");
    expect(planFromTenant(undefined)).toBe("basic");
    expect(planFromTenant("")).toBe("basic");
    expect(planFromTenant("bogus")).toBe("basic");
    expect(planFromTenant("pro")).toBe("pro");
    expect(planFromTenant("enterprise")).toBe("enterprise");
  });
  it("seat limits: basic 1, pro 3, enterprise unlimited", () => {
    expect(seatLimit("basic")).toBe(1);
    expect(seatLimit("pro")).toBe(3);
    expect(seatLimit("enterprise")).toBeNull();
    expect(PLAN_LIMITS.basic.seats).toBe(1);
  });
  it("allowedKeys returns the plan's full key set", () => {
    expect(allowedKeys("basic")).toContain("pdv");
    expect(allowedKeys("basic")).not.toContain("fiscal.nfce");
    expect(allowedKeys("enterprise")).toContain("multistore");
  });
});
