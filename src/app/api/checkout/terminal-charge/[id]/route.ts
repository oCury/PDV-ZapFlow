import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrder } from "@/lib/mercadopago/orders";
import { finalizeCharge } from "@/lib/mercadopago/finalize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const charge = await prisma.terminalCharge.findUnique({ where: { id } });
  if (!charge) return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });

  // If not yet resolved, pull the order and let finalizeCharge reconcile (idempotent).
  const pending = ["CREATED", "SENT", "PROCESSING"].includes(charge.status);
  if (pending && !charge.mp_order_id.startsWith("pending_")) {
    try {
      const order = await getOrder(charge.mp_order_id);
      const payment = order.transactions?.payments?.[0];
      if (order.status && payment?.id) {
        await finalizeCharge(charge.mp_order_id, {
          status: payment.status ?? order.status,
          paymentId: payment.id,
        });
      }
    } catch {
      // polling is best-effort; webhook remains source of truth
    }
  }

  const fresh = await prisma.terminalCharge.findUnique({ where: { id } });
  return NextResponse.json({
    status: fresh?.status,
    approved: fresh?.status === "APPROVED",
    saleId: fresh?.sale_id,
  });
}
