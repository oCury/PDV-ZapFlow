import { prisma } from "@/lib/prisma";

export interface AbcCurveItem {
  productId: string;
  productName: string;
  category: string;
  revenue: number;
  percentage: number;
  cumulativePercentage: number;
  classification: "A" | "B" | "C";
  quantitySold: number;
}

interface AbcCurveParams {
  startDate: Date;
  endDate: Date;
  categoryId?: string;
}

export async function calculateAbcCurve({
  startDate,
  endDate,
  categoryId,
}: AbcCurveParams): Promise<AbcCurveItem[]> {
  const saleItems = await prisma.saleItem.findMany({
    where: {
      sale: {
        status: { in: ["APPROVED", "COMPLETED"] },
        created_at: { gte: startDate, lte: endDate },
      },
      ...(categoryId
        ? { product: { category_id: categoryId } }
        : {}),
    },
    select: {
      product_id: true,
      quantity: true,
      unit_price: true,
      product: {
        select: {
          id: true,
          name: true,
          category: true,
          category_rel: { select: { name: true } },
        },
      },
    },
  });

  const revenueMap = new Map<
    string,
    { productName: string; category: string; revenue: number; quantitySold: number }
  >();

  for (const item of saleItems) {
    const key = item.product_id;
    const existing = revenueMap.get(key);
    const itemRevenue = Number(item.unit_price) * item.quantity;
    const categoryName =
      item.product.category_rel?.name ?? item.product.category;

    if (existing) {
      revenueMap.set(key, {
        ...existing,
        revenue: existing.revenue + itemRevenue,
        quantitySold: existing.quantitySold + item.quantity,
      });
    } else {
      revenueMap.set(key, {
        productName: item.product.name,
        category: categoryName,
        revenue: itemRevenue,
        quantitySold: item.quantity,
      });
    }
  }

  const sorted = Array.from(revenueMap.entries())
    .map(([productId, data]) => ({ productId, ...data }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = sorted.reduce((sum, item) => sum + item.revenue, 0);

  if (totalRevenue === 0) {
    return [];
  }

  let cumulative = 0;

  return sorted.map((item) => {
    const percentage = (item.revenue / totalRevenue) * 100;
    cumulative += percentage;

    let classification: "A" | "B" | "C";
    if (cumulative <= 80) {
      classification = "A";
    } else if (cumulative <= 95) {
      classification = "B";
    } else {
      classification = "C";
    }

    return {
      productId: item.productId,
      productName: item.productName,
      category: item.category,
      revenue: item.revenue,
      percentage: Math.round(percentage * 100) / 100,
      cumulativePercentage: Math.round(cumulative * 100) / 100,
      classification,
      quantitySold: item.quantitySold,
    };
  });
}
