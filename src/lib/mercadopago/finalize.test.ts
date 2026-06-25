import { describe, it, expect, vi, beforeEach } from "vitest";

const { tx, basePrismaMock } = vi.hoisted(() => {
  const tx = {
    terminalCharge: { update: vi.fn() },
    sale: { update: vi.fn() },
    salePayment: { create: vi.fn() },
    productVariant: { update: vi.fn() },
    product: { update: vi.fn() },
  };
  const basePrismaMock = {
    terminalCharge: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, basePrismaMock };
});
vi.mock("@/lib/prisma", () => ({ basePrisma: basePrismaMock }));

import { finalizeCharge } from "./finalize";

beforeEach(() => {
  vi.clearAllMocks();
});

function charge(overrides = {}) {
  return {
    id: "chg_1",
    mp_order_id: "ord_1",
    sale_id: "sale_1",
    amount: 100,
    method: "CREDIT",
    installments: 3,
    status: "SENT",
    sale: {
      id: "sale_1",
      status: "PENDING",
      items: [
        { product_id: "p1", variant_id: "v1", quantity: 2 },
        { product_id: "p2", variant_id: null, quantity: 1 },
      ],
    },
    ...overrides,
  };
}

describe("finalizeCharge", () => {
  it("approves the sale, records payment, decrements variant- and product-level stock", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge());
    await finalizeCharge("ord_1", { status: "approved", paymentId: "pay_9", cardBrand: "visa" });

    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sale_1" }, data: { status: "APPROVED" } })
    );
    expect(tx.salePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sale_id: "sale_1",
          payment_method: "CARD",
          amount: 100,
          installments: 3,
          card_brand: "visa",
          mp_payment_id: "pay_9",
          terminal_charge_id: "chg_1",
        }),
      })
    );
    expect(tx.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "v1" }, data: { stock_quantity: { decrement: 2 } } })
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p2" }, data: { stock_quantity: { decrement: 1 } } })
    );
  });

  it("is a no-op when the charge is already APPROVED (idempotent)", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge({ status: "APPROVED" }));
    await finalizeCharge("ord_1", { status: "approved", paymentId: "pay_9" });
    expect(basePrismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("marks the charge DECLINED without touching stock when not approved", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge());
    await finalizeCharge("ord_1", { status: "rejected", paymentId: "pay_9" });
    expect(basePrismaMock.terminalCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DECLINED" }) })
    );
    expect(tx.sale.update).not.toHaveBeenCalled();
    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });

  it("does nothing when the order id is unknown", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(null);
    await finalizeCharge("ord_unknown", { status: "approved", paymentId: "x" });
    expect(basePrismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("maps PIX charges to the PIX payment method", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge({ method: "PIX", installments: 1 }));
    await finalizeCharge("ord_1", { status: "approved", paymentId: "pay_9" });
    expect(tx.salePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payment_method: "PIX" }) })
    );
  });
});
