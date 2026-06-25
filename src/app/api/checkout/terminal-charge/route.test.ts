import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  paymentTerminal: { findUnique: vi.fn() },
  terminalCharge: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  sale: { create: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/settings", () => ({ getNumericSetting: vi.fn(async () => 6) }));
vi.mock("@/lib/mercadopago/orders", () => ({ createTerminalOrder: vi.fn() }));

import { POST } from "./route";
import { createTerminalOrder } from "@/lib/mercadopago/orders";

const createOrderMock = createTerminalOrder as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://x/api/checkout/terminal-charge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const base = {
  terminalId: "t1",
  method: "CREDIT",
  installments: 3,
  totalAmount: 90,
  items: [{ productId: "p1", quantity: 1, unitPrice: 90 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.paymentTerminal.findUnique.mockResolvedValue({ id: "t1", mp_device_id: "DEV", is_active: true });
  prismaMock.terminalCharge.findFirst.mockResolvedValue(null);
  prismaMock.sale.create.mockResolvedValue({ id: "sale_1" });
  prismaMock.terminalCharge.create.mockResolvedValue({ id: "chg_1" });
  prismaMock.terminalCharge.update.mockResolvedValue({ id: "chg_1", status: "SENT" });
  createOrderMock.mockResolvedValue({ id: "ord_1" });
});

describe("POST terminal-charge", () => {
  it("rejects parcela below R$5,00", async () => {
    const res = await POST(req({ ...base, totalAmount: 12, installments: 3 }));
    expect(res.status).toBe(400);
  });
  it("returns 409 when terminal already has an active charge", async () => {
    prismaMock.terminalCharge.findFirst.mockResolvedValue({ id: "old" });
    const res = await POST(req(base));
    expect(res.status).toBe(409);
  });
  it("creates the order and returns chargeId on the happy path", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ chargeId: "chg_1", status: "SENT" });
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ terminalDeviceId: "DEV", installments: 3 })
    );
  });
});
