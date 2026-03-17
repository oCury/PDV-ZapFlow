import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { openOrderSchema } from "@/lib/validations/pos";

/**
 * POST /api/orders — open a new order (command) on a table.
 *
 * Creates a Sale with status=OPEN and no payment. Items can be added later
 * via PATCH /api/orders/[id]. The order is finalized via the standard
 * POST /api/sales flow (or PATCH /api/orders/[id] with { action: "checkout" }).
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = openOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const { tableId, items, notes, customerPhone, customerId } = parsed.data;

    const phoneNormalized = customerPhone.replace(/\D/g, "");
    if (phoneNormalized.length < 10) {
      return NextResponse.json(
        { error: "Telefone inválido. Informe pelo menos 10 dígitos." },
        { status: 400 }
      );
    }

    // Find or create customer by phone (for charging if they leave without paying)
    let finalCustomerId = customerId;
    if (!finalCustomerId) {
      const existing = await prisma.customer.findFirst({
        where: {
          OR: [
            { phone: { contains: phoneNormalized } },
            { phone: phoneNormalized },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        finalCustomerId = existing.id;
      } else {
        const newCustomer = await prisma.customer.create({
          data: { phone: phoneNormalized },
          select: { id: true },
        });
        finalCustomerId = newCustomer.id;
      }
    }

    // Ensure table exists and is available
    const table = await prisma.table.findUnique({ where: { id: tableId } });
    if (!table) {
      return NextResponse.json({ error: "Mesa não encontrada" }, { status: 404 });
    }
    if (table.status === "OCCUPIED") {
      return NextResponse.json(
        { error: "Mesa já possui uma comanda aberta" },
        { status: 409 }
      );
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.sale.create({
        data: {
          total_amount: totalAmount,
          payment_method: "CASH", // placeholder; updated at checkout
          status: "OPEN",
          table_id: tableId,
          customer_id: finalCustomerId,
          notes: notes ?? null,
          items: {
            create: items.map((item) => ({
              product_id: item.productId,
              quantity: item.quantity,
              unit_price: item.unitPrice,
            })),
          },
        },
        include: { items: true },
      });

      // Mark table as occupied
      await tx.table.update({
        where: { id: tableId },
        data: { status: "OCCUPIED" },
      });

      return newOrder;
    });

    return NextResponse.json(
      { id: order.id, status: order.status, total_amount: Number(order.total_amount) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Open order failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** GET /api/orders — list all open orders */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orders = await prisma.sale.findMany({
      where: { status: "OPEN" },
      include: {
        table: { select: { id: true, number: true, name: true } },
        items: {
          include: {
            product: { select: { name: true, sell_price: true } },
          },
        },
      },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error("Orders fetch failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
