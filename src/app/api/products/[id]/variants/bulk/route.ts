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
      sizes,
      colors,
      stock_per_variant,
      min_stock,
      cost_price,
      sell_price,
    } = body;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return NextResponse.json(
        { error: "Produto nao encontrado." },
        { status: 404 }
      );
    }

    if (!Array.isArray(sizes) || sizes.length === 0) {
      return NextResponse.json(
        { error: "Campo obrigatorio: sizes (array com pelo menos 1 item)" },
        { status: 400 }
      );
    }

    const colorList =
      Array.isArray(colors) && colors.length > 0 ? colors : [null];

    const variantsToCreate: Array<{
      sku: string;
      size: string;
      color: string | null;
    }> = [];
    const skippedSkus: string[] = [];

    for (const size of sizes) {
      for (const color of colorList) {
        const sku =
          `${id.slice(0, 4)}-${size}-${color || "STD"}`.toUpperCase();

        const existingSku = await prisma.productVariant.findFirst({
          where: { sku },
        });

        if (existingSku) {
          skippedSkus.push(sku);
          continue;
        }

        variantsToCreate.push({ sku, size, color });
      }
    }

    if (variantsToCreate.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhuma variante nova para criar. Todos os SKUs ja existem.",
          skipped: skippedSkus,
        },
        { status: 409 }
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const item of variantsToCreate) {
        const variant = await tx.productVariant.create({
          data: {
            product_id: id,
            sku: item.sku,
            size: item.size,
            color: item.color,
            stock_quantity: stock_per_variant ?? 0,
            min_stock: min_stock ?? 0,
            cost_price: cost_price ?? null,
            sell_price: sell_price ?? null,
          },
        });
        results.push(variant);
      }

      await tx.product.update({
        where: { id },
        data: { has_variants: true },
      });

      return results;
    });

    return NextResponse.json(
      {
        created: created.map(serializeVariant),
        created_count: created.length,
        skipped: skippedSkus,
        skipped_count: skippedSkus.length,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao criar variantes em lote." },
      { status: 500 }
    );
  }
}
