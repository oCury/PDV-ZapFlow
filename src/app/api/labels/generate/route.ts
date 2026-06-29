import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { generateLabelsSchema, type LabelItemData } from "@/lib/validations/labels";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const gate = await requireEntitlement("labels");
    if (gate) return gate;

    const body = await request.json();
    const parsed = generateLabelsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { items } = parsed.data;

    const productIds = [...new Set(items.map((i) => i.productId))];
    const variantIds = items
      .filter((i) => i.variantId)
      .map((i) => i.variantId as string);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        barcode: true,
        sell_price: true,
        variants: variantIds.length > 0
          ? {
              where: { id: { in: variantIds }, active: true },
              select: {
                id: true,
                sku: true,
                size: true,
                color: true,
                barcode: true,
                sell_price: true,
              },
            }
          : false,
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const labelItems: LabelItemData[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) continue;

      if (item.variantId && product.variants) {
        const variant = (product.variants as Array<{
          id: string;
          sku: string;
          size: string;
          color: string | null;
          barcode: string | null;
          sell_price: number | null;
        }>).find((v) => v.id === item.variantId);

        if (!variant) continue;

        labelItems.push({
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          barcode: variant.barcode || product.barcode,
          price: Number(variant.sell_price ?? product.sell_price),
          size: variant.size,
          color: variant.color ?? undefined,
          sku: variant.sku,
          quantity: item.quantity,
        });
      } else {
        labelItems.push({
          productId: product.id,
          name: product.name,
          barcode: product.barcode,
          price: Number(product.sell_price),
          quantity: item.quantity,
        });
      }
    }

    return NextResponse.json({ items: labelItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
