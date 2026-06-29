import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalRevenue = await prisma.sale.aggregate({
    _sum: {
      total_amount: true,
    },
    where: {
      created_at: { gte: today },
      status: "APPROVED",
    },
  });

  const revenueData = Number(totalRevenue._sum.total_amount || 0);
  return NextResponse.json({
    revenue: revenueData,
  });
}
