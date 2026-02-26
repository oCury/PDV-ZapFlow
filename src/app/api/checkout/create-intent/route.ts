import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentIntent } from "@/lib/mercadopago";

interface CartItemPayload {
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface CreateIntentBody {
  amount: number;
  deviceId: string;
  items: CartItemPayload[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateIntentBody;
    const { amount, deviceId, items } = body;

    if (!amount || !deviceId) {
      return NextResponse.json(
        { error: "amount and deviceId are required" },
        { status: 400 }
      );
    }

    if (!items?.length) {
      return NextResponse.json(
        { error: "items are required" },
        { status: 400 }
      );
    }

    const sale = await prisma.sale.create({
      data: {
        total_amount: amount,
        payment_method: "CARD",
        status: "PENDING",
        items: {
          create: items.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          })),
        },
      },
    });

    try {
      const amountInCents = Math.round(amount * 100);
      const intent = await createPaymentIntent(deviceId, amountInCents, sale.id);

      return NextResponse.json({
        intentId: intent.id,
        saleId: sale.id,
      });
    } catch (mpError) {
      await prisma.sale.delete({ where: { id: sale.id } });
      return NextResponse.json(
        { error: "Failed to create payment intent on Mercado Pago" },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
