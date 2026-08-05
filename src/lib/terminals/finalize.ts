import { basePrisma } from "@/lib/prisma";
import type { TerminalChargeStatus, TerminalProviderName } from "@prisma/client";

const TERMINAL_STATES = new Set(["APPROVED", "DECLINED", "CANCELED", "ERROR", "EXPIRED"]);

export interface FinalizeInput {
  provider: TerminalProviderName;
  externalOrderId: string;
  status: TerminalChargeStatus;
  externalPaymentId?: string;
  cardBrand?: string;
}

/** Idempotent reconciliation: keyed on (provider, external_order_id). */
export async function finalizeTerminalCharge(input: FinalizeInput): Promise<void> {
  const charge = await basePrisma.terminalCharge.findFirst({
    where: { provider: input.provider, external_order_id: input.externalOrderId },
    include: { sale: { include: { items: true } } },
  });
  if (!charge || TERMINAL_STATES.has(charge.status)) return;

  if (input.status !== "APPROVED") {
    await basePrisma.terminalCharge.update({
      where: { id: charge.id },
      data: {
        status: input.status,
        error_code: input.status,
        resolved_at: new Date(),
        external_payment_id: input.externalPaymentId,
      },
    });
    return;
  }

  await basePrisma.$transaction(async (tx) => {
    await tx.terminalCharge.update({
      where: { id: charge.id },
      data: {
        status: "APPROVED",
        external_payment_id: input.externalPaymentId,
        resolved_at: new Date(),
      },
    });
    if (charge.sale_id) {
      await tx.sale.update({ where: { id: charge.sale_id }, data: { status: "APPROVED" } });
      await tx.salePayment.create({
        data: {
          sale_id: charge.sale_id,
          payment_method: charge.method === "PIX" ? "PIX" : "CARD",
          amount: charge.amount,
          installments: charge.installments,
          card_brand: input.cardBrand ?? null,
          mp_payment_id: input.externalPaymentId,
          terminal_charge_id: charge.id,
        },
      });
      for (const item of charge.sale?.items ?? []) {
        if (item.variant_id) {
          await tx.productVariant.update({
            where: { id: item.variant_id },
            data: { stock_quantity: { decrement: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.product_id },
            data: { stock_quantity: { decrement: item.quantity } },
          });
        }
      }
    }
  });
}
