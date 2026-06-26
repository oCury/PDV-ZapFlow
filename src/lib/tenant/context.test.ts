import { describe, it, expect } from "vitest";
import { runWithTenant, enterTenant, getTenantId, getTenantIdOrNull } from "./context";

describe("tenant context", () => {
  it("returns the tenant id inside runWithTenant", () => {
    expect(runWithTenant("t1", () => getTenantId())).toBe("t1");
  });

  it("throws when getTenantId runs with no context", () => {
    expect(() => getTenantId()).toThrow(/No tenant context/);
  });

  it("getTenantIdOrNull returns null with no context", () => {
    expect(getTenantIdOrNull()).toBeNull();
  });

  it("enterTenant overrides within a context and does not leak outside it", () => {
    const inside = runWithTenant("a", () => {
      enterTenant("b");
      return getTenantId();
    });
    expect(inside).toBe("b");
    expect(getTenantIdOrNull()).toBeNull();
  });
});
