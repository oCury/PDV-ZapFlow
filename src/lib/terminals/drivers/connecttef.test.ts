import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/connecttef/client", () => ({ connectTefFetch: vi.fn() }));
import { connectTefFetch } from "@/lib/connecttef/client";
import { connectTefDriver } from "./connecttef";

const creds = { endpoint: "https://tef.example", agentToken: "at_1", merchantId: "m1" };
beforeEach(() => vi.clearAllMocks());

describe("connectTefDriver", () => {
  it("creates a transaction and normalizes status", async () => {
    (connectTefFetch as any).mockResolvedValue({ transactionId: "tx_1", status: "processing" });
    const res = await connectTefDriver.createCharge(creds, { deviceExternalId: "POS1", amount: 20, method: "CREDIT", installments: 1, externalRef: "chg_1" });
    expect(res.ok && res.data.externalOrderId).toBe("tx_1");
    expect(res.ok && res.data.status).toBe("PROCESSING");
  });
  it("has deviceSync=false and no listDevices", () => {
    expect(connectTefDriver.capabilities.deviceSync).toBe(false);
    expect(connectTefDriver.listDevices).toBeUndefined();
  });
});
