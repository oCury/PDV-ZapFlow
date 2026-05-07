import { prisma } from "@/lib/prisma";

export interface StockTurnoverItem {
  productId: string;
  productName: string;
  variantId: string | null;
  size: string | null;
  color: string | null;
  quantitySold: number;
  currentStock: number;
  turnoverRate: number;
}

interface StockTurnoverParams {
  startDate: Date;
  endDate: Date;
}

export async function calculateStockTurnover({
  startDate,
  endDate,
}: StockTurnoverParams): Promise<StockTurnoverItem[]> {
  // Fetch all products with variants
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      stock_quantity: true,
      has_variants: true,
      variants: {
        where: { active: true },
        select: {
          id: true,
          size: true,
          color: true,
          stock_quantity: true,
        },
      },
    },
  });

  // Fetch sales in the period
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: { in: ["APPROVED", "COMPLETED"] },
        created_at: { gte: startDate, lte: endDate },
      },
    },
    select: {
      product_id: true,
      variant_id: true,
      quantity: true,
    },
  });

  // Build sales quantity map: "productId" or "productId::variantId"
  const salesMap = new Map<string, number>();
  for (const item of saleItems) {
    const key = item.variant_id
      ? `${item.product_id}::${item.variant_id}`
      : item.product_id;
    salesMap.set(key, (salesMap.get(key) ?? 0) + item.quantity);
  }

  const results: StockTurnoverItem[] = [];

  for (const product of products) {
    if (product.has_variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        const key = `${product.id}::${variant.id}`;
        const quantitySold = salesMap.get(key) ?? 0;
        const currentStock = variant.stock_quantity;
        const turnoverRate =
          currentStock > 0 ? quantitySold / currentStock : quantitySold > 0 ? quantitySold : 0;

        results.push({
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          size: variant.size,
          color: variant.color ?? null,
          quantitySold,
          currentStock,
          turnoverRate: Math.round(turnoverRate * 100) / 100,
        });
      }
    } else {
      const quantitySold = salesMap.get(product.id) ?? 0;
      const currentStock = product.stock_quantity;
      const turnoverRate =
        currentStock > 0 ? quantitySold / currentStock : quantitySold > 0 ? quantitySold : 0;

      results.push({
        productId: product.id,
        productName: product.name,
        variantId: null,
        size: null,
        color: null,
        quantitySold,
        currentStock,
        turnoverRate: Math.round(turnoverRate * 100) / 100,
      });
    }
  }

  return results.sort((a, b) => b.turnoverRate - a.turnoverRate);
}
