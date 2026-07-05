import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/stone/client", () => ({ stoneFetch: vi.fn() }));
import { stoneFetch } from "@/lib/stone/client";
import { stoneDriver } from "./stone";

const creds = { apiKey: "sk_test", merchantId: "mrc_1" };
beforeEach(() => vi.clearAllMocks());

describe("stoneDriver", () => {
  it("creates a charge and normalizes status", async () => {
    (stoneFetch as any).mockResolvedValue({ id: "so_1", status: "pending" });
    const res = await stoneDriver.createCharge(creds, { deviceExternalId: "D1", amount: 12.5, method: "CREDIT", installments: 2, externalRef: "chg_1" });
    expect(res.ok && res.data.externalOrderId).toBe("so_1");
    expect(res.ok && res.data.status).toBe("PROCESSING");
  });
  it("maps failures to OperatorError", async () => {
    (stoneFetch as any).mockRejectedValue(Object.assign(new Error("x"), { status: 403 }));
    const res = await stoneDriver.createCharge(creds, { deviceExternalId: "D1", amount: 1, method: "DEBIT", installments: 1, externalRef: "chg_1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFIG");
  });
  it("declares Stone capabilities", () => {
    expect(stoneDriver.capabilities.methods).toContain("CREDIT");
  });
});
