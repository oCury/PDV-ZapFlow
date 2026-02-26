import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const today = new Date();
  const last7Days = new Date();
  last7Days.setDate(today.getDate() - 7);
  last7Days.setHours(0, 0, 0, 0);

  const totalRevenue = await prisma.sale.aggregate({
    _sum: {
      total_amount: true,
    },
    where: {
      created_at: { gte: last7Days },
      status: "APPROVED",
    },
  });

  return NextResponse.json({
    revenue: Number(totalRevenue._sum.total_amount || 0),
  });
}
