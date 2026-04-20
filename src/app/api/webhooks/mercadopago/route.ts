import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPayment, validateWebhookSignature } from "@/lib/mercadopago";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");

    if (xSignature && xRequestId) {
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

    const payment = await getPayment(paymentId);

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
