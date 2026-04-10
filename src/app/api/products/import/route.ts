import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

interface ImportProduct {
  name: string;
  barcode: string;
  cost_price: number;
  sell_price: number;
  stock_quantity: number;
  category: string;
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { products } = body as { products: ImportProduct[] };

    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: "Nenhum produto para importar." },
        { status: 400 }
      );
    }

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const p of products) {
      if (!p.name || !p.barcode || p.sell_price == null) {
        results.errors.push(`Produto "${p.name || "sem nome"}" sem dados obrigatórios.`);
        continue;
      }

      try {
        const existing = await prisma.product.findUnique({
          where: { barcode: p.barcode },
        });

        if (existing) {
          // Update stock quantity (add to existing)
          await prisma.product.update({
            where: { barcode: p.barcode },
            data: {
              stock_quantity: existing.stock_quantity + p.stock_quantity,
              cost_price: p.cost_price,
            },
          });
          results.updated++;
        } else {
          await prisma.product.create({
            data: {
              name: p.name,
              barcode: p.barcode,
              cost_price: p.cost_price || 0,
              sell_price: p.sell_price,
              stock_quantity: p.stock_quantity || 0,
              category: p.category || "Geral",
            },
          });
          results.created++;
        }
      } catch (error) {
        console.error(`Error importing product ${p.name}:`, error);
        results.errors.push(`Erro ao importar "${p.name}".`);
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `${results.created} criado(s), ${results.updated} atualizado(s)${results.errors.length > 0 ? `, ${results.errors.length} erro(s)` : ""}`,
    });
  } catch (error) {
    console.error("Error importing products:", error);
    return NextResponse.json(
      { error: "Erro interno ao importar produtos." },
      { status: 500 }
    );
  }
}
