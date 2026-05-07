import { prisma } from "@/lib/prisma";

export interface StaleProductItem {
  productId: string;
  productName: string;
  variantId: string | null;
  size: string | null;
  color: string | null;
  stock: number;
  lastSaleDate: string | null;
  daysSinceLastSale: number;
}

interface StaleProductsParams {
  days: number;
}

export async function calculateStaleProducts({
  days,
}: StaleProductsParams): Promise<StaleProductItem[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Fetch products with stock
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { has_variants: false, stock_quantity: { gt: 0 } },
        {
          has_variants: true,
          variants: { some: { stock_quantity: { gt: 0 }, active: true } },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      stock_quantity: true,
      has_variants: true,
      variants: {
        where: { active: true, stock_quantity: { gt: 0 } },
        select: {
          id: true,
          size: true,
          color: true,
          stock_quantity: true,
        },
      },
    },
  });

  // Fetch last sale date per product/variant
  const recentSaleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: { in: ["APPROVED", "COMPLETED"] },
      },
    },
    select: {
      product_id: true,
      variant_id: true,
      sale: { select: { created_at: true } },
    },
    orderBy: { sale: { created_at: "desc" } },
  });

  // Build last sale map
  const lastSaleMap = new Map<string, Date>();
  for (const item of recentSaleItems) {
    const key = item.variant_id
      ? `${item.product_id}::${item.variant_id}`
      : item.product_id;
    if (!lastSaleMap.has(key)) {
      lastSaleMap.set(key, item.sale.created_at);
    }
  }

  const now = new Date();
  const results: StaleProductItem[] = [];

  for (const product of products) {
    if (product.has_variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        const key = `${product.id}::${variant.id}`;
        const lastSale = lastSaleMap.get(key) ?? null;
        const daysSince = lastSale
          ? Math.floor(
              (now.getTime() - lastSale.getTime()) / (1000 * 60 * 60 * 24)
            )
          : Infinity;

        if (daysSince >= days) {
          results.push({
            productId: product.id,
            productName: product.name,
            variantId: variant.id,
            size: variant.size,
            color: variant.color ?? null,
            stock: variant.stock_quantity,
            lastSaleDate: lastSale ? lastSale.toISOString() : null,
            daysSinceLastSale: lastSale ? daysSince : -1,
          });
        }
      }
    } else if (!product.has_variants && product.stock_quantity > 0) {
      const lastSale = lastSaleMap.get(product.id) ?? null;
      const daysSince = lastSale
        ? Math.floor(
            (now.getTime() - lastSale.getTime()) / (1000 * 60 * 60 * 24)
          )
        : Infinity;

      if (daysSince >= days) {
        results.push({
          productId: product.id,
          productName: product.name,
          variantId: null,
          size: null,
          color: null,
          stock: product.stock_quantity,
          lastSaleDate: lastSale ? lastSale.toISOString() : null,
          daysSinceLastSale: lastSale ? daysSince : -1,
        });
      }
    }
  }

  // Sort: never sold first (daysSinceLastSale = -1), then by most days
  return results.sort((a, b) => {
    if (a.daysSinceLastSale === -1 && b.daysSinceLastSale === -1) return 0;
    if (a.daysSinceLastSale === -1) return -1;
    if (b.daysSinceLastSale === -1) return 1;
    return b.daysSinceLastSale - a.daysSinceLastSale;
  });
}
