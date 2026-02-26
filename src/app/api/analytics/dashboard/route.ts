import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const [todayAgg, todayCount, todayItemsSold, yesterdayAgg, latestSales] =
    await Promise.all([
      prisma.sale.aggregate({
        _sum: { total_amount: true },
        where: { created_at: { gte: todayStart }, status: "APPROVED" },
      }),

      prisma.sale.count({
        where: { created_at: { gte: todayStart }, status: "APPROVED" },
      }),

      prisma.saleItem.aggregate({
        _sum: { quantity: true },
        where: {
          sale: { created_at: { gte: todayStart }, status: "APPROVED" },
        },
      }),

      prisma.sale.aggregate({
        _sum: { total_amount: true },
        where: {
          created_at: { gte: yesterdayStart, lt: todayStart },
          status: "APPROVED",
        },
      }),

      prisma.sale.findMany({
        where: { status: "APPROVED" },
        orderBy: { created_at: "desc" },
        take: 5,
        select: {
          id: true,
          total_amount: true,
          payment_method: true,
          created_at: true,
          items: {
            select: { quantity: true },
          },
        },
      }),
    ]);

  const todayRevenue = Number(todayAgg._sum.total_amount || 0);
  const yesterdayRevenue = Number(yesterdayAgg._sum.total_amount || 0);
  const productsSold = todayItemsSold._sum.quantity || 0;
  const transactionCount = todayCount;
  const averageTicket = transactionCount > 0 ? todayRevenue / transactionCount : 0;

  const revenueChange =
    yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : todayRevenue > 0
        ? 100
        : 0;

  return NextResponse.json({
    todayRevenue,
    productsSold,
    transactionCount,
    averageTicket,
    revenueChange: Math.round(revenueChange),
    latestSales: latestSales.map((sale) => ({
      id: sale.id,
      totalAmount: Number(sale.total_amount),
      paymentMethod: sale.payment_method,
      createdAt: sale.created_at.toISOString(),
      itemCount: sale.items.reduce((sum, i) => sum + i.quantity, 0),
    })),
  });
}
