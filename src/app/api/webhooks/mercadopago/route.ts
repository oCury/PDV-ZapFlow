import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPayment, validateWebhookSignature } from "@/lib/mercadopago/checkout";
import { getOrder } from "@/lib/mercadopago/orders";
import { finalizeCharge } from "@/lib/mercadopago/finalize";
import { resolveTenantFromUserId } from "@/lib/mercadopago/webhookTenant";
import { resolveMpAccessToken } from "@/lib/mercadopago/connection";
import { runWithTenant } from "@/lib/tenant/context";

const FALLBACK_TENANT_ID = process.env.MP_FALLBACK_TENANT_ID ?? "";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    if (!xSignature || !xRequestId) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }
    if (!validateWebhookSignature(xSignature, xRequestId, String(body.data?.id))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Resolve the tenant that owns this MP resource (Connect: collector user_id).
    const userId = String(body.user_id ?? "");
    const tenantId = (await resolveTenantFromUserId(userId)) ?? FALLBACK_TENANT_ID;
    if (!tenantId) {
      console.warn(`[mp-webhook] no tenant for user_id=${userId}; ignoring`);
      return NextResponse.json({ received: true, ignored: "no_tenant" });
    }

    return await runWithTenant(tenantId, async () => {
      const accessToken = await resolveMpAccessToken(tenantId);
      const topic = body.type ?? body.topic;

      if (topic === "order") {
        const orderId = String(body.data?.id ?? body.id);
        if (!orderId || orderId === "undefined") {
          return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
        }
        const order = await getOrder(orderId, accessToken);
        const payment = order.transactions?.payments?.[0];
        if (order.status && payment?.id) {
          await finalizeCharge(orderId, { status: payment.status ?? order.status, paymentId: payment.id });
        }
        return NextResponse.json({ received: true, order: orderId });
      }

      if (body.type !== "payment") {
        return NextResponse.json({ received: true });
      }

      const paymentId = String(body.data?.id);
      if (!paymentId || paymentId === "undefined") {
        return NextResponse.json({ error: "Missing payment ID" }, { status: 400 });
      }
      const payment = await getPayment(paymentId, accessToken);
      if (payment.status !== "approved") {
        return NextResponse.json({ received: true, status: payment.status });
      }

      const saleId = payment.external_reference;
      if (!saleId) {
        return NextResponse.json({ error: "Missing external_reference in payment" }, { status: 400 });
      }
      const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
      if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      if (sale.status === "APPROVED") return NextResponse.json({ received: true, already_processed: true });

      const stockOps = sale.items.map((item) =>
        item.variant_id
          ? prisma.productVariant.update({ where: { id: item.variant_id }, data: { stock_quantity: { decrement: item.quantity } } })
          : prisma.product.update({ where: { id: item.product_id }, data: { stock_quantity: { decrement: item.quantity } } })
      );
      await prisma.$transaction([
        prisma.sale.update({ where: { id: saleId }, data: { status: "APPROVED" } }),
        ...stockOps,
      ]);
      return NextResponse.json({ received: true, sale_approved: true });
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
