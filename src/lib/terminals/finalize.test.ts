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

import { finalizeTerminalCharge } from "./finalize";

beforeEach(() => vi.clearAllMocks());
const charge = (o = {}) => ({
  id: "chg_1", provider: "stone", external_order_id: "ord_1", sale_id: "sale_1",
  amount: 100, method: "CREDIT", installments: 3, status: "SENT",
  sale: { id: "sale_1", status: "PENDING", items: [{ product_id: "p1", variant_id: "v1", quantity: 2 }] },
  ...o,
});

describe("finalizeTerminalCharge", () => {
  it("approves, records payment, decrements stock on APPROVED", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge());
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "ord_1", status: "APPROVED", externalPaymentId: "pay_9", cardBrand: "visa" });
    expect(tx.sale.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "APPROVED" } }));
    expect(tx.salePayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ terminal_charge_id: "chg_1", card_brand: "visa" }) }));
    expect(tx.productVariant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "v1" }, data: { stock_quantity: { decrement: 2 } } }));
  });
  it("is idempotent when already APPROVED", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge({ status: "APPROVED" }));
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "ord_1", status: "APPROVED", externalPaymentId: "p" });
    expect(basePrismaMock.$transaction).not.toHaveBeenCalled();
  });
  it("marks DECLINED without touching stock", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge());
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "ord_1", status: "DECLINED", externalPaymentId: "p" });
    expect(basePrismaMock.terminalCharge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DECLINED" }) }));
    expect(tx.sale.update).not.toHaveBeenCalled();
  });
  it("no-ops on unknown order", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(null);
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "nope", status: "APPROVED", externalPaymentId: "p" });
    expect(basePrismaMock.$transaction).not.toHaveBeenCalled();
  });
});
