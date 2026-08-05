import { describe, it, expect } from "vitest";
import { sandboxDriver } from "./sandbox";

describe("sandboxDriver", () => {
  it("createCharge returns a fake order in PROCESSING", async () => {
    const d = sandboxDriver("stone");
    const res = await d.createCharge({}, { deviceExternalId: "X", amount: 1, method: "DEBIT", installments: 1, externalRef: "chg_1" });
    expect(res.ok && res.data.status).toBe("PROCESSING");
    expect(res.ok && res.data.externalOrderId).toContain("sbx_");
  });

  it("getChargeStatus is PROCESSING before the delay and APPROVED after", async () => {
    const d = sandboxDriver("stone");
    const fresh = `sbx_chg_1_${Date.now()}`;
    const early = await d.getChargeStatus({}, fresh);
    expect(early.ok && early.data.status).toBe("PROCESSING");
    const old = `sbx_chg_1_${Date.now() - 10_000}`;
    const late = await d.getChargeStatus({}, old);
    expect(late.ok && late.data.status).toBe("APPROVED");
  });

  it("name matches the requested provider", () => {
    expect(sandboxDriver("connecttef").name).toBe("connecttef");
  });
});
