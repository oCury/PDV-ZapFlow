import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!code || code.trim().length === 0) {
    return NextResponse.json(
      { error: "Barcode is required" },
      { status: 400 }
    );
  }

  const product = await prisma.product.findUnique({
    where: { barcode: code },
    select: {
      id: true,
      name: true,
      barcode: true,
      sell_price: true,
      stock_quantity: true,
      category: true,
      image_url: true,
    },
  });

  if (!product) {
    return NextResponse.json(
      { error: "Produto não encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...product,
    sell_price: Number(product.sell_price),
  });
}
