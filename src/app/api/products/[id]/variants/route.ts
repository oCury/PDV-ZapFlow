import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function serializeVariant(variant: {
  cost_price?: unknown;
  sell_price?: unknown;
  [key: string]: unknown;
}) {
  return {
    ...variant,
    cost_price: variant.cost_price != null ? Number(variant.cost_price) : null,
    sell_price: variant.sell_price != null ? Number(variant.sell_price) : null,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        category: true,
        has_variants: true,
        variants: {
          orderBy: [{ size: "asc" }, { color: "asc" }],
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Produto nao encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        category: product.category,
        has_variants: product.has_variants,
      },
      variants: product.variants.map(serializeVariant),
    });
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao listar variantes." },
      { status: 500 }
    );
  }
}

export async function POST(
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
    const {
      sku: rawSku,
      size,
      color,
      model,
      barcode,
      stock_quantity,
      min_stock,
      cost_price,
      sell_price,
      image_url,
    } = body;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json(
        { error: "Produto nao encontrado." },
        { status: 404 }
      );
    }

    if (!size) {
      return NextResponse.json(
        { error: "Campo obrigatorio: size" },
        { status: 400 }
      );
    }

    const sku =
      rawSku ||
      `${id.slice(0, 4)}-${size}-${color || "STD"}`.toUpperCase();

    const existingSku = await prisma.productVariant.findUnique({
      where: { sku },
    });
    if (existingSku) {
      return NextResponse.json(
        { error: `Ja existe uma variante com o SKU "${sku}".` },
        { status: 409 }
      );
    }

    if (barcode) {
      const existingBarcode = await prisma.productVariant.findUnique({
        where: { barcode },
      });
      if (existingBarcode) {
        return NextResponse.json(
          { error: "Ja existe uma variante com este codigo de barras." },
          { status: 409 }
        );
      }
    }

    const variant = await prisma.productVariant.create({
      data: {
        product_id: id,
        sku,
        size,
        color: color || null,
        model: model || null,
        barcode: barcode || null,
        stock_quantity: stock_quantity ?? 0,
        min_stock: min_stock ?? 0,
        cost_price: cost_price ?? null,
        sell_price: sell_price ?? null,
        image_url: image_url || null,
      },
    });

    await prisma.product.update({
      where: { id },
      data: { has_variants: true },
    });

    return NextResponse.json(serializeVariant(variant), { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao criar variante." },
      { status: 500 }
    );
  }
}
