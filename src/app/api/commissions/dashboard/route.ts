import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calculateCommission } from "@/lib/commissions/calculate";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId =
      req.nextUrl.searchParams.get("userId") ?? session.userId;

    const now = new Date();

    // Today range
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Week range (Monday to Sunday)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Month range
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    // Parallel queries for sales counts and totals
    const [salesToday, salesWeek, salesMonth] = await Promise.all([
      prisma.sale.aggregate({
        where: {
          seller_id: userId,
          status: { in: ["APPROVED", "COMPLETED"] },
          created_at: { gte: todayStart, lte: todayEnd },
        },
        _sum: { total_amount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: {
          seller_id: userId,
          status: { in: ["APPROVED", "COMPLETED"] },
          created_at: { gte: weekStart, lte: weekEnd },
        },
        _sum: { total_amount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: {
          seller_id: userId,
          status: { in: ["APPROVED", "COMPLETED"] },
          created_at: { gte: monthStart, lte: monthEnd },
        },
        _sum: { total_amount: true },
        _count: true,
      }),
    ]);

    // Commission for the month
    const monthCommission = await calculateCommission(
      userId,
      monthStart,
      monthEnd
    );

    // Active goal for the period
    const activeGoal = await prisma.salesGoal.findFirst({
      where: {
        user_id: userId,
        start_date: { lte: now },
        end_date: { gte: now },
      },
      orderBy: { created_at: "desc" },
    });

    const goalTarget = activeGoal ? Number(activeGoal.target) : null;
    const monthTotal = Number(salesMonth._sum.total_amount ?? 0);
    const goalProgress =
      goalTarget && goalTarget > 0
        ? Math.min((monthTotal / goalTarget) * 100, 100)
        : null;

    // Recent sales (last 10)
    const recentSales = await prisma.sale.findMany({
      where: {
        seller_id: userId,
        status: { in: ["APPROVED", "COMPLETED"] },
      },
      orderBy: { created_at: "desc" },
      take: 10,
      select: {
        id: true,
        total_amount: true,
        created_at: true,
        payment_method: true,
        customer: { select: { name: true } },
      },
    });

    return NextResponse.json({
      today: {
        total: Number(salesToday._sum.total_amount ?? 0),
        count: salesToday._count,
      },
      week: {
        total: Number(salesWeek._sum.total_amount ?? 0),
        count: salesWeek._count,
      },
      month: {
        total: monthTotal,
        count: salesMonth._count,
      },
      commission: {
        amount: monthCommission.commissionAmount,
        percent: monthCommission.commissionPercent,
        ruleType: monthCommission.ruleType,
      },
      goal: activeGoal
        ? {
            id: activeGoal.id,
            period: activeGoal.period,
            target: goalTarget,
            progress: Math.round((goalProgress ?? 0) * 100) / 100,
          }
        : null,
      recentSales: recentSales.map((s) => ({
        id: s.id,
        totalAmount: Number(s.total_amount),
        createdAt: s.created_at,
        paymentMethod: s.payment_method,
        customerName: s.customer?.name ?? null,
      })),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao carregar dashboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
