import { prisma } from "@/lib/prisma";

export interface PeriodComparisonItem {
  metric: string;
  period1Value: number;
  period2Value: number;
  delta: number;
  deltaPercent: number;
}

interface PeriodComparisonParams {
  period1Start: Date;
  period1End: Date;
  period2Start: Date;
  period2End: Date;
}

async function getPeriodMetrics(start: Date, end: Date) {
  const sales = await prisma.sale.findMany({
    where: {
      status: { in: ["APPROVED", "COMPLETED"] },
      created_at: { gte: start, lte: end },
    },
    select: {
      id: true,
      total_amount: true,
      items: {
        select: { quantity: true },
      },
    },
  });

  const totalRevenue = sales.reduce(
    (sum, s) => sum + Number(s.total_amount),
    0
  );
  const totalSales = sales.length;
  const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
  const totalItems = sales.reduce(
    (sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.quantity, 0),
    0
  );

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgTicket: Math.round(avgTicket * 100) / 100,
    totalSales,
    totalItems,
  };
}

export async function calculatePeriodComparison({
  period1Start,
  period1End,
  period2Start,
  period2End,
}: PeriodComparisonParams): Promise<PeriodComparisonItem[]> {
  const [p1, p2] = await Promise.all([
    getPeriodMetrics(period1Start, period1End),
    getPeriodMetrics(period2Start, period2End),
  ]);

  const buildRow = (
    metric: string,
    v1: number,
    v2: number
  ): PeriodComparisonItem => {
    const delta = v2 - v1;
    const deltaPercent = v1 > 0 ? (delta / v1) * 100 : v2 > 0 ? 100 : 0;

    return {
      metric,
      period1Value: v1,
      period2Value: v2,
      delta: Math.round(delta * 100) / 100,
      deltaPercent: Math.round(deltaPercent * 100) / 100,
    };
  };

  return [
    buildRow("Faturamento", p1.totalRevenue, p2.totalRevenue),
    buildRow("Ticket Medio", p1.avgTicket, p2.avgTicket),
    buildRow("Numero de Vendas", p1.totalSales, p2.totalSales),
    buildRow("Itens Vendidos", p1.totalItems, p2.totalItems),
  ];
}
