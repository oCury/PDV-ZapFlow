import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPayment, validateWebhookSignature } from "@/lib/mercadopago/checkout";
import { getOrder } from "@/lib/mercadopago/orders";
import { finalizeCharge } from "@/lib/mercadopago/finalize";
import { getAccessToken } from "@/lib/mercadopago/client";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");

    if (!xSignature || !xRequestId) {
      return NextResponse.json(
        { error: "Missing signature headers" },
        { status: 401 }
      );
    }

    const isValid = validateWebhookSignature(
      xSignature,
      xRequestId,
      String(body.data?.id)
    );
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // ── Orders topic (Point Smart terminal) ──────────────────────────────
    const topic = body.type ?? body.topic;
    if (topic === "order") {
      const orderId = String(body.data?.id ?? body.id);
      if (!orderId || orderId === "undefined") {
        return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
      }
      const order = await getOrder(orderId, getAccessToken()); // TODO next task: tenant token
      const payment = order.transactions?.payments?.[0];
      if (order.status && payment?.id) {
        await finalizeCharge(orderId, {
          status: payment.status ?? order.status,
          paymentId: payment.id,
        });
      }
      return NextResponse.json({ received: true, order: orderId });
    }

    if (body.type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = String(body.data?.id);
    if (!paymentId || paymentId === "undefined") {
      return NextResponse.json(
        { error: "Missing payment ID" },
        { status: 400 }
      );
    }

    const payment = await getPayment(paymentId, getAccessToken()); // TODO next task: tenant token

    if (payment.status !== "approved") {
      return NextResponse.json({ received: true, status: payment.status });
    }

    const saleId = payment.external_reference;
    if (!saleId) {
      return NextResponse.json(
        { error: "Missing external_reference in payment" },
        { status: 400 }
      );
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });

    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    if (sale.status === "APPROVED") {
      return NextResponse.json({ received: true, already_processed: true });
    }

    // ── Decrement stock: variant-level or product-level ──────────────────
    const stockOps = sale.items.map((item) => {
      if (item.variant_id) {
        return prisma.productVariant.update({
          where: { id: item.variant_id },
          data: { stock_quantity: { decrement: item.quantity } },
        });
      }
      return prisma.product.update({
        where: { id: item.product_id },
        data: { stock_quantity: { decrement: item.quantity } },
      });
    });

    await prisma.$transaction([
      prisma.sale.update({
        where: { id: saleId },
        data: { status: "APPROVED" },
      }),
      ...stockOps,
    ]);

    return NextResponse.json({ received: true, sale_approved: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
