import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const salesByCategory = await prisma.saleItem.groupBy({
    by: ["product_id"],
    _sum: {
      quantity: true,
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _sum: {
        quantity: "desc",
      },
    },
  });

  const categoriesWithNames = await Promise.all(
    salesByCategory.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.product_id },
        select: { category: true },
      });
      return { category: product?.category || "Desconhecido", quantity: item._sum.quantity || 0 };
    })
  );

  const aggregatedCategories: { [key: string]: number } = {};
  categoriesWithNames.forEach((item) => {
    if (item.category) {
      aggregatedCategories[item.category] = (aggregatedCategories[item.category] || 0) + item.quantity;
    }
  });

  const chartData = Object.entries(aggregatedCategories).map(([category, quantity]) => ({
    name: category,
    sales: quantity,
  }));

  return NextResponse.json(chartData);
}
