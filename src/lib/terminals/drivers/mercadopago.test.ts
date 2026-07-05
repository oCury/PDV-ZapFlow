import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mercadopago/orders", () => ({
  createTerminalOrder: vi.fn(),
  getOrder: vi.fn(),
  cancelOrder: vi.fn(),
}));

import { createTerminalOrder, getOrder } from "@/lib/mercadopago/orders";
import { mercadoPagoDriver } from "./mercadopago";

const creds = { accessToken: "tok", mpUserId: "u_1" };
beforeEach(() => vi.clearAllMocks());

describe("mercadoPagoDriver", () => {
  it("creates a charge and returns a normalized ProviderCharge", async () => {
    (createTerminalOrder as any).mockResolvedValue({ id: "ord_1", status: "created" });
    const res = await mercadoPagoDriver.createCharge(creds, {
      deviceExternalId: "DEV1", amount: 10, method: "CREDIT", installments: 1, externalRef: "chg_1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.externalOrderId).toBe("ord_1");
      expect(res.data.status).toBe("PROCESSING");
    }
    expect(createTerminalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ terminalDeviceId: "DEV1", externalRef: "chg_1" }),
      "tok",
    );
  });

  it("normalizes an approved order status on getChargeStatus", async () => {
    (getOrder as any).mockResolvedValue({
      id: "ord_1", status: "processed",
      transactions: { payments: [{ id: "pay_1", status: "approved" }] },
    });
    const res = await mercadoPagoDriver.getChargeStatus(creds, "ord_1");
    expect(res.ok && res.data.status).toBe("APPROVED");
    expect(res.ok && res.data.externalPaymentId).toBe("pay_1");
  });

  it("maps MP API errors to an OperatorError", async () => {
    (createTerminalOrder as any).mockRejectedValue(Object.assign(new Error("x"), { status: 409 }));
    const res = await mercadoPagoDriver.createCharge(creds, {
      deviceExternalId: "DEV1", amount: 10, method: "CREDIT", installments: 1, externalRef: "chg_1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("DEVICE_BUSY");
  });

  it("declares MP capabilities", () => {
    expect(mercadoPagoDriver.capabilities).toMatchObject({
      deviceSync: true, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"],
    });
  });
});
