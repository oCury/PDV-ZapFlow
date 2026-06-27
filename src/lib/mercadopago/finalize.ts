import { basePrisma } from "@/lib/prisma";
import type { TerminalChargeMethod } from "@prisma/client";

export interface FinalizeInput {
  status: string; // MP payment/order status, e.g. "approved" | "rejected"
  paymentId: string;
  cardBrand?: string;
}

const APPROVED_STATES = new Set(["approved", "processed"]);
const TERMINAL_STATES = new Set(["APPROVED", "DECLINED", "CANCELED", "ERROR", "EXPIRED"]);

function chargeMethodToPaymentMethod(method: TerminalChargeMethod): "CARD" | "PIX" {
  return method === "PIX" ? "PIX" : "CARD";
}

/**
 * Idempotently reconcile a resolved MP order into our DB.
 * Safe to call from both the webhook and the polling fallback — keyed by mp_order_id,
 * a no-op once the charge has reached a terminal state.
 *
 * Uses basePrisma (unscoped) — webhook has no user session.
 * Called inside runWithTenant() from the webhook; basePrisma lookup by globally-unique mp_order_id is intentional.
 */
export async function finalizeCharge(orderId: string, input: FinalizeInput): Promise<void> {
  const charge = await basePrisma.terminalCharge.findFirst({
    where: { mp_order_id: orderId },
    include: { sale: { include: { items: true } } },
  });

  if (!charge) return; // unknown order — nothing to do
  if (TERMINAL_STATES.has(charge.status)) return; // already finalized — idempotent no-op

  const approved = APPROVED_STATES.has(input.status.toLowerCase());

  if (!approved) {
    await basePrisma.terminalCharge.update({
      where: { id: charge.id },
      data: {
        status: "DECLINED",
        mp_payment_id: input.paymentId,
        error_code: input.status,
        resolved_at: new Date(),
      },
    });
    return;
  }

  const sale = charge.sale;
  await basePrisma.$transaction(async (tx) => {
    await tx.terminalCharge.update({
      where: { id: charge.id },
      data: { status: "APPROVED", mp_payment_id: input.paymentId, resolved_at: new Date() },
    });

    if (sale) {
      await tx.sale.update({ where: { id: sale.id }, data: { status: "APPROVED" } });

      await tx.salePayment.create({
        data: {
          sale_id: sale.id,
          payment_method: chargeMethodToPaymentMethod(charge.method),
          amount: charge.amount,
          installments: charge.installments,
          card_brand: input.cardBrand ?? null,
          mp_payment_id: input.paymentId,
          terminal_charge_id: charge.id,
        },
      });

      for (const item of sale.items) {
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
