import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const totalRevenue = await prisma.sale.aggregate({
    _sum: {
      total_amount: true,
    },
    where: {
      created_at: { gte: firstDayOfMonth },
      status: "APPROVED",
    },
  });

  return NextResponse.json({
    revenue: Number(totalRevenue._sum.total_amount || 0),
  });
}
