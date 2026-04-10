import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, barcode, cost_price, sell_price, stock_quantity, min_stock, category, image_url } = body;

    if (!name || !barcode || sell_price == null || !category) {
      return NextResponse.json(
        { error: "Campos obrigatórios: name, barcode, sell_price, category" },
        { status: 400 }
      );
    }

    const duplicate = await prisma.product.findFirst({
      where: { barcode, NOT: { id } },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Já existe outro produto com este código de barras." },
        { status: 409 }
      );
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        barcode,
        cost_price: cost_price ?? 0,
        sell_price,
        stock_quantity: stock_quantity ?? 0,
        min_stock: min_stock ?? 0,
        category,
        image_url: image_url || null,
      },
    });

    return NextResponse.json({
      ...product,
      sell_price: Number(product.sell_price),
      cost_price: Number(product.cost_price),
    });
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar produto." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { id } = await params;
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Erro ao excluir produto. Verifique se ele não está vinculado a vendas." },
      { status: 500 }
    );
  }
}
