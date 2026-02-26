import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface SaleItemPayload {
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface CreateSaleBody {
  totalAmount: number;
  paymentMethod: "CASH" | "CARD" | "PIX";
  items: SaleItemPayload[];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateSaleBody;
    const { totalAmount, paymentMethod, items } = body;

    if (!totalAmount || !paymentMethod || !items?.length) {
      return NextResponse.json(
        { error: "totalAmount, paymentMethod and items are required" },
        { status: 400 }
      );
    }

    const sale = await prisma.$transaction(async (tx) => {
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

      const newSale = await tx.sale.create({
        data: {
          total_amount: totalAmount,
          payment_method: paymentMethod,
          status: "APPROVED",
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

      return newSale;
    });

    return NextResponse.json(
      {
        id: sale.id,
        status: sale.status,
        total_amount: Number(sale.total_amount),
        items: sale.items.length,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Sale creation failed:", error);

    const isStockError =
      error.message?.includes("Estoque insuficiente") ||
      error.message?.includes("Produto não encontrado");

    return NextResponse.json(
      { error: error.message || "Erro interno ao processar venda." },
      { status: isStockError ? 400 : 500 }
    );
  }
}
