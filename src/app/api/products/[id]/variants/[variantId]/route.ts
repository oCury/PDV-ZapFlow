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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { id, variantId } = await params;
    const body = await req.json();
    const {
      sku,
      size,
      color,
      model,
      barcode,
      stock_quantity,
      min_stock,
      cost_price,
      sell_price,
      image_url,
      active,
    } = body;

    const existing = await prisma.productVariant.findFirst({
      where: { id: variantId, product_id: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Variante nao encontrada." },
        { status: 404 }
      );
    }

    if (sku && sku !== existing.sku) {
      const duplicateSku = await prisma.productVariant.findFirst({
        where: { sku },
      });
      if (duplicateSku) {
        return NextResponse.json(
          { error: `Ja existe uma variante com o SKU "${sku}".` },
          { status: 409 }
        );
      }
    }

    if (barcode && barcode !== existing.barcode) {
      const duplicateBarcode = await prisma.productVariant.findFirst({
        where: { barcode },
      });
      if (duplicateBarcode) {
        return NextResponse.json(
          { error: "Ja existe uma variante com este codigo de barras." },
          { status: 409 }
        );
      }
    }

    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(sku !== undefined && { sku }),
        ...(size !== undefined && { size }),
        ...(color !== undefined && { color: color || null }),
        ...(model !== undefined && { model: model || null }),
        ...(barcode !== undefined && { barcode: barcode || null }),
        ...(stock_quantity !== undefined && { stock_quantity }),
        ...(min_stock !== undefined && { min_stock }),
        ...(cost_price !== undefined && { cost_price }),
        ...(sell_price !== undefined && { sell_price }),
        ...(image_url !== undefined && { image_url: image_url || null }),
        ...(active !== undefined && { active }),
      },
    });

    return NextResponse.json(serializeVariant(variant));
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao atualizar variante." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { id, variantId } = await params;

    const existing = await prisma.productVariant.findFirst({
      where: { id: variantId, product_id: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Variante nao encontrada." },
        { status: 404 }
      );
    }

    await prisma.productVariant.delete({ where: { id: variantId } });

    const remainingCount = await prisma.productVariant.count({
      where: { product_id: id },
    });

    if (remainingCount === 0) {
      await prisma.product.update({
        where: { id },
        data: { has_variants: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Erro ao excluir variante. Verifique se ela nao esta vinculada a vendas." },
      { status: 500 }
    );
  }
}
