import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const topSellers = await prisma.saleItem.groupBy({
    by: ["product_id"],
    _sum: {
      quantity: true,
    },
    orderBy: {
      _sum: {
        quantity: "desc",
      },
    },
    take: 5,
  });

  const topSellersWithDetails = await Promise.all(
    topSellers.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.product_id },
        select: {
          name: true,
          image_url: true,
        },
      });
      return {
        name: product?.name || "Produto Desconhecido",
        image_url: product?.image_url,
        totalSold: item._sum.quantity || 0,
      };
    })
  );

  return NextResponse.json(topSellersWithDetails);
}
