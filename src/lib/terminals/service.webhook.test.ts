import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    providerConnection: { findFirst: vi.fn() },
    terminalCharge: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, basePrisma: prismaMock }));
vi.mock("./finalize", () => ({ finalizeTerminalCharge: vi.fn() }));
vi.mock("@/lib/tenant/context", () => ({ runWithTenant: vi.fn(async (_t: string, fn: () => unknown) => fn()) }));
vi.mock("./connections", () => ({ loadConnection: vi.fn(async () => null) }));

import { finalizeTerminalCharge } from "./finalize";
import { handleWebhook } from "./service";

beforeEach(() => vi.clearAllMocks());

describe("handleWebhook", () => {
  it("resolves tenant via the charge fallback and finalizes an approved sandbox webhook", async () => {
    prismaMock.terminalCharge.findFirst.mockResolvedValue({ tenant_id: "tnt_1" });
    const out = await handleWebhook("stone", {}, JSON.stringify({ externalOrderId: "ord_1" }));
    expect(out.received).toBe(true);
    expect(finalizeTerminalCharge).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "stone", externalOrderId: "ord_1", status: "APPROVED" }),
    );
  });

  it("returns received:false when no tenant can be resolved", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(null);
    prismaMock.terminalCharge.findFirst.mockResolvedValue(null);
    const out = await handleWebhook("stone", {}, JSON.stringify({ externalOrderId: "ord_x" }));
    expect(out.received).toBe(false);
    expect(finalizeTerminalCharge).not.toHaveBeenCalled();
  });
});
