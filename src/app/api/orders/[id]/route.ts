import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { saleItemPayloadSchema } from "@/lib/validations/pos";
import { z } from "zod";

const addItemsSchema = z.object({
  action: z.literal("add_items"),
  items: z.array(saleItemPayloadSchema).min(1),
});

const cancelSchema = z.object({
  action: z.literal("cancel"),
  reason: z.string().optional(),
});

const patchSchema = z.discriminatedUnion("action", [addItemsSchema, cancelSchema]);

/**
 * PATCH /api/orders/[id]
 *
 * Supported actions:
 *  - add_items  → append items to an OPEN order and recalculate total
 *  - cancel     → set status=CANCELLED and free the table
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const order = await prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Comanda não encontrada" }, { status: 404 });
    }

    if (order.status !== "OPEN") {
      return NextResponse.json(
        { error: "Somente comandas abertas podem ser modificadas" },
        { status: 409 }
      );
    }

    if (parsed.data.action === "cancel") {
      const updated = await prisma.$transaction(async (tx) => {
        const cancelled = await tx.sale.update({
          where: { id },
          data: { status: "CANCELLED" },
        });

        if (order.table_id) {
          await tx.table.update({
            where: { id: order.table_id },
            data: { status: "AVAILABLE" },
          });
        }

        return cancelled;
      });

      return NextResponse.json({ id: updated.id, status: updated.status });
    }

    // action === "add_items"
    const { items } = parsed.data as z.infer<typeof addItemsSchema>;
    const addedTotal = items.reduce(
      (s, i) => s + i.unitPrice * i.quantity,
      0
    );

    const updated = await prisma.$transaction(async (tx) => {
      await tx.saleItem.createMany({
        data: items.map((i) => ({
          sale_id: id,
          product_id: i.productId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
        })),
      });

      return tx.sale.update({
        where: { id },
        data: { total_amount: { increment: addedTotal } },
        include: { items: { include: { product: { select: { name: true } } } } },
      });
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      total_amount: Number(updated.total_amount),
      itemCount: updated.items.length,
    });
  } catch (error) {
    console.error("Order PATCH failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** GET /api/orders/[id] — fetch a single open order with items */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const order = await prisma.sale.findUnique({
      where: { id },
      include: {
        table: { select: { id: true, number: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sell_price: true, image_url: true } },
          },
        },
        customer: { select: { id: true, name: true, loyalty_points: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Comanda não encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      ...order,
      total_amount: Number(order.total_amount),
    });
  } catch (error) {
    console.error("Order GET failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
