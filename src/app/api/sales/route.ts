import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createSaleSchema } from "@/lib/validations/pos";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const parsed = createSaleSchema.safeParse({
      totalAmount: body.totalAmount,
      items: body.items,
      payments: body.payments,
      paymentMethod: body.paymentMethod,
      customerId: body.customerId,
      customerPhone: body.customerPhone,
      tableId: body.tableId,
      loyaltyDiscount: body.loyaltyDiscount,
      notes: body.notes,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const {
      totalAmount,
      items,
      payments,
      paymentMethod,
      customerId,
      tableId,
      loyaltyDiscount,
      notes,
    } = parsed.data;

    const primaryMethod =
      payments?.length ? payments[0].paymentMethod : (paymentMethod ?? "CASH");

    const paymentList =
      (payments?.length ?? 0) > 0
        ? payments!
        : [{ paymentMethod: primaryMethod, amount: totalAmount }];

    // ── Loyalty points redemption (M3) ─────────────────────────────────────
    let loyaltyPointsUsed = 0;
    if (loyaltyDiscount && loyaltyDiscount > 0 && customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { loyalty_points: true },
      });
      loyaltyPointsUsed = Math.min(
        customer?.loyalty_points ?? 0,
        Math.ceil(loyaltyDiscount)
      );
    }

    const sale = await prisma.$transaction(async (tx) => {
      // ── Stock validation + decrement ──────────────────────────────────────
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, name: true, stock_quantity: true },
        });

        if (!product) {
          throw new Error(`Produto não encontrado: ${item.productId}`);
        }

        if (product.stock_quantity < item.quantity) {
          throw new Error(
            `Estoque insuficiente para "${product.name}". Disponível: ${product.stock_quantity}, solicitado: ${item.quantity}`
          );
        }

        await tx.product.update({
          where: { id: item.productId },
          data: { stock_quantity: { decrement: item.quantity } },
        });
      }

      // ── Create Sale ───────────────────────────────────────────────────────
      const newSale = await tx.sale.create({
        data: {
          total_amount: totalAmount,
          payment_method: primaryMethod,
          status: "APPROVED",
          customer_id: customerId ?? null,
          table_id: tableId ?? null,
          loyalty_discount: loyaltyDiscount ?? null,
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

      if (paymentList.length > 0) {
        await tx.salePayment.createMany({
          data: paymentList.map((p) => ({
            sale_id: newSale.id,
            payment_method: p.paymentMethod,
            amount: p.amount,
          })),
        });
      }

      // ── Loyalty points: deduct used, add earned (M3) ───────────────────
      if (customerId) {
        const pointsEarned = Math.floor(totalAmount); // 1 BRL = 1 point

        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyalty_points: {
              increment: pointsEarned - loyaltyPointsUsed,
            },
          },
        });
      }

      // ── Release table if occupied (M5) ────────────────────────────────────
      if (tableId) {
        await tx.table.update({
          where: { id: tableId },
          data: { status: "AVAILABLE" },
        });
      }

      return newSale;
    });

    // ── M2: Check which items hit their min_stock threshold ───────────────
    const productIds = items.map((i) => i.productId);
    const stockAlerts = await prisma.$queryRaw<
      { id: string; name: string; stock_quantity: number; min_stock: number }[]
    >`
      SELECT id, name, stock_quantity, min_stock
      FROM   products
      WHERE  id = ANY(${productIds}::text[])
        AND  min_stock > 0
        AND  stock_quantity <= min_stock
    `;

    return NextResponse.json(
      {
        id: sale.id,
        status: sale.status,
        total_amount: Number(sale.total_amount),
        items: sale.items.length,
        stockAlerts: stockAlerts.map((p) => ({
          id: p.id,
          name: p.name,
          stock_quantity: Number(p.stock_quantity),
          min_stock: Number(p.min_stock),
        })),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Sale creation failed:", error);

    const message =
      error instanceof Error ? error.message : "Erro interno ao processar venda.";
    const isStockError =
      message.includes("Estoque insuficiente") ||
      message.includes("Produto não encontrado");

    return NextResponse.json(
      { error: message },
      { status: isStockError ? 400 : 500 }
    );
  }
}
