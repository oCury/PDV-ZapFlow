import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/products/low-stock
 *
 * Returns products where stock_quantity <= min_stock (and min_stock > 0).
 * Prisma ORM doesn't support field-to-field comparisons natively, so we
 * use a raw SQL query which is safe here (no user input interpolated).
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lowStock = await prisma.$queryRaw<
      {
        id: string;
        name: string;
        barcode: string;
        stock_quantity: number;
        min_stock: number;
        category: string;
        image_url: string | null;
      }[]
    >`
      SELECT id, name, barcode,
             stock_quantity, min_stock,
             category, image_url
      FROM   products
      WHERE  min_stock > 0
        AND  stock_quantity <= min_stock
      ORDER  BY (stock_quantity::float / NULLIF(min_stock, 0)) ASC
      LIMIT  20
    `;

    return NextResponse.json(
      lowStock.map((p) => ({
        ...p,
        stock_quantity: Number(p.stock_quantity),
        min_stock: Number(p.min_stock),
      }))
    );
  } catch (error) {
    console.error("Low-stock query failed:", error);
    return NextResponse.json(
      { error: "Erro ao buscar produtos com estoque crítico" },
      { status: 500 }
    );
  }
}
