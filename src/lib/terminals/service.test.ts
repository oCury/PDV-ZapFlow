import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    paymentTerminal: { findFirst: vi.fn() },
    terminalCharge: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    sale: { create: vi.fn(), delete: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, basePrisma: prismaMock }));
vi.mock("./connections", () => ({ loadConnection: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getNumericSetting: vi.fn(async () => 12) }));

import { loadConnection } from "./connections";
import { initiateCharge } from "./service";

beforeEach(() => vi.clearAllMocks());

describe("initiateCharge", () => {
  it("reserves a sale+charge and sends via the sandbox driver", async () => {
    prismaMock.paymentTerminal.findFirst.mockResolvedValue({ id: "t1", provider: "stone", device_external_id: "DEV1", mp_device_id: "DEV1", is_active: true });
    (loadConnection as any).mockResolvedValue({ provider: "stone", mode: "sandbox", status: "sandbox", credentials: {} });
    prismaMock.terminalCharge.findFirst.mockResolvedValue(null);
    prismaMock.sale.create.mockResolvedValue({ id: "sale_1" });
    prismaMock.terminalCharge.create.mockResolvedValue({ id: "chg_1" });
    const res = await initiateCharge({ terminalId: "t1", method: "DEBIT", installments: 1, totalAmount: 1, items: [{ productId: "p1", quantity: 1, unitPrice: 1 }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe("SENT");
    expect(prismaMock.terminalCharge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
  });
  it("rejects with DEVICE_BUSY when an active charge exists", async () => {
    prismaMock.paymentTerminal.findFirst.mockResolvedValue({ id: "t1", provider: "stone", device_external_id: "DEV1", mp_device_id: "DEV1", is_active: true });
    (loadConnection as any).mockResolvedValue({ provider: "stone", mode: "sandbox", status: "sandbox", credentials: {} });
    prismaMock.terminalCharge.findFirst.mockResolvedValue({ id: "busy" });
    const res = await initiateCharge({ terminalId: "t1", method: "DEBIT", installments: 1, totalAmount: 1, items: [{ productId: "p1", quantity: 1, unitPrice: 1 }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("DEVICE_BUSY");
  });
  it("rejects when the provider is not connected", async () => {
    prismaMock.paymentTerminal.findFirst.mockResolvedValue({ id: "t1", provider: "stone", device_external_id: "DEV1", mp_device_id: "DEV1", is_active: true });
    (loadConnection as any).mockResolvedValue(null);
    const res = await initiateCharge({ terminalId: "t1", method: "DEBIT", installments: 1, totalAmount: 1, items: [{ productId: "p1", quantity: 1, unitPrice: 1 }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFIG");
  });
});
