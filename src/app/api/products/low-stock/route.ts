import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant/context";

/**
 * GET /api/products/low-stock
 *
 * Returns products where stock_quantity <= min_stock (and min_stock > 0),
 * OR stock_quantity <= threshold (if provided).
 * 
 * Query params:
 * - threshold: number - Returns products with stock <= threshold (default: uses min_stock per product)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const threshold = searchParams.get("threshold");

    let lowStock;

    if (threshold) {
      const thresholdNum = parseInt(threshold, 10);
      
      lowStock = await prisma.$queryRaw<
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
        WHERE  stock_quantity <= ${thresholdNum}
          AND  stock_quantity >= 0
          AND  tenant_id = ${getTenantId()}
        ORDER  BY stock_quantity ASC
        LIMIT  50
      `;
    } else {
      lowStock = await prisma.$queryRaw<
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
          AND  tenant_id = ${getTenantId()}
        ORDER  BY (stock_quantity::float / NULLIF(min_stock, 0)) ASC
        LIMIT  20
      `;
    }

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
