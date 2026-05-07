import { prisma } from "@/lib/prisma";

export interface ProfitMarginItem {
  productId: string;
  productName: string;
  costPrice: number;
  sellPrice: number;
  margin: number;
  marginPercent: number;
  quantitySold: number;
  totalRevenue: number;
  totalProfit: number;
  costMissing: boolean;
}

interface ProfitMarginParams {
  startDate: Date;
  endDate: Date;
}

export async function calculateProfitMargin({
  startDate,
  endDate,
}: ProfitMarginParams): Promise<ProfitMarginItem[]> {
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
      unit_price: true,
      product: {
        select: {
          id: true,
          name: true,
          cost_price: true,
          sell_price: true,
        },
      },
      variant: {
        select: {
          id: true,
          cost_price: true,
          sell_price: true,
        },
      },
    },
  });

  const productMap = new Map<
    string,
    {
      productName: string;
      costPrice: number;
      sellPrice: number;
      quantitySold: number;
      totalRevenue: number;
      totalCost: number;
      costMissing: boolean;
    }
  >();

  for (const item of saleItems) {
    const key = item.product_id;
    const costPrice = item.variant?.cost_price
      ? Number(item.variant.cost_price)
      : Number(item.product.cost_price);
    const sellPrice = item.variant?.sell_price
      ? Number(item.variant.sell_price)
      : Number(item.product.sell_price);
    const unitPrice = Number(item.unit_price);
    const costMissing = costPrice === 0;

    const existing = productMap.get(key);

    if (existing) {
      productMap.set(key, {
        ...existing,
        quantitySold: existing.quantitySold + item.quantity,
        totalRevenue: existing.totalRevenue + unitPrice * item.quantity,
        totalCost: existing.totalCost + costPrice * item.quantity,
        costMissing: existing.costMissing || costMissing,
      });
    } else {
      productMap.set(key, {
        productName: item.product.name,
        costPrice,
        sellPrice,
        quantitySold: item.quantity,
        totalRevenue: unitPrice * item.quantity,
        totalCost: costPrice * item.quantity,
        costMissing,
      });
    }
  }

  return Array.from(productMap.entries())
    .map(([productId, data]) => {
      const margin = data.sellPrice - data.costPrice;
      const marginPercent =
        data.sellPrice > 0 ? (margin / data.sellPrice) * 100 : 0;
      const totalProfit = data.totalRevenue - data.totalCost;

      return {
        productId,
        productName: data.productName,
        costPrice: data.costPrice,
        sellPrice: data.sellPrice,
        margin: Math.round(margin * 100) / 100,
        marginPercent: Math.round(marginPercent * 100) / 100,
        quantitySold: data.quantitySold,
        totalRevenue: Math.round(data.totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        costMissing: data.costMissing,
      };
    })
    .sort((a, b) => b.totalProfit - a.totalProfit);
}
