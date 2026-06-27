import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant/context";
import { resolveMpAccessToken } from "@/lib/mercadopago/connection";
import { cancelOrder } from "@/lib/mercadopago/orders";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant();
  if (!tenant) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const charge = await prisma.terminalCharge.findUnique({ where: { id } });
  if (!charge) return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });

  if (!charge.mp_order_id.startsWith("pending_")) {
    const accessToken = await resolveMpAccessToken(getTenantId());
    await cancelOrder(charge.mp_order_id, accessToken).catch(() => {});
  }
  await prisma.terminalCharge.update({
    where: { id },
    data: { status: "CANCELED", resolved_at: new Date() },
  });
  if (charge.sale_id) {
    await prisma.sale.update({ where: { id: charge.sale_id }, data: { status: "CANCELLED" } });
  }
  return NextResponse.json({ status: "CANCELED" });
}
