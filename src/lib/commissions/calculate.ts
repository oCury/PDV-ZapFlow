import { prisma } from "@/lib/prisma";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CommissionDetail {
  saleId: string;
  amount: number;
  commission: number;
}

export interface CommissionResult {
  userId: string;
  userName: string;
  totalSales: number;
  salesCount: number;
  commissionAmount: number;
  commissionPercent: number;
  ruleType: string;
  details: CommissionDetail[];
}

// ─── Calculate ──────────────────────────────────────────────────────────────

export async function calculateCommission(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CommissionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });

  if (!user) {
    throw new Error("Vendedor não encontrado");
  }

  const rule = await prisma.commissionRule.findFirst({
    where: { user_id: userId, active: true },
    include: {
      category_rules: true,
      tiers: { orderBy: { min_revenue: "asc" } },
    },
  });

  const sales = await prisma.sale.findMany({
    where: {
      seller_id: userId,
      status: { in: ["APPROVED", "COMPLETED"] },
      created_at: { gte: startDate, lte: endDate },
    },
    include: {
      items: {
        include: {
          product: { select: { category_id: true } },
        },
      },
    },
  });

  const totalSales = sales.reduce(
    (sum, sale) => sum + Number(sale.total_amount),
    0
  );

  if (!rule) {
    return {
      userId: user.id,
      userName: user.name,
      totalSales,
      salesCount: sales.length,
      commissionAmount: 0,
      commissionPercent: 0,
      ruleType: "NONE",
      details: [],
    };
  }

  const defaultPercent = Number(rule.default_percent);
  const details: CommissionDetail[] = [];
  let totalCommission = 0;

  switch (rule.type) {
    case "FIXED_PERCENT": {
      for (const sale of sales) {
        const saleAmount = Number(sale.total_amount);
        const commission = (saleAmount * defaultPercent) / 100;
        totalCommission += commission;
        details.push({
          saleId: sale.id,
          amount: saleAmount,
          commission,
        });
      }
      break;
    }

    case "CATEGORY_PERCENT": {
      const categoryMap = new Map(
        rule.category_rules.map((cr) => [cr.category_id, Number(cr.percent)])
      );

      for (const sale of sales) {
        let saleCommission = 0;
        const saleAmount = Number(sale.total_amount);

        for (const item of sale.items) {
          const itemTotal = Number(item.unit_price) * item.quantity;
          const categoryId = item.product.category_id;
          const percent = categoryId
            ? (categoryMap.get(categoryId) ?? defaultPercent)
            : defaultPercent;
          saleCommission += (itemTotal * percent) / 100;
        }

        totalCommission += saleCommission;
        details.push({
          saleId: sale.id,
          amount: saleAmount,
          commission: saleCommission,
        });
      }
      break;
    }

    case "TIERED": {
      const tiers = rule.tiers.map((t) => ({
        minRevenue: Number(t.min_revenue),
        maxRevenue: t.max_revenue ? Number(t.max_revenue) : null,
        percent: Number(t.percent),
      }));

      const applicableTier = tiers.find(
        (t) =>
          totalSales >= t.minRevenue &&
          (t.maxRevenue === null || totalSales <= t.maxRevenue)
      );

      const tierPercent = applicableTier?.percent ?? defaultPercent;

      for (const sale of sales) {
        const saleAmount = Number(sale.total_amount);
        const commission = (saleAmount * tierPercent) / 100;
        totalCommission += commission;
        details.push({
          saleId: sale.id,
          amount: saleAmount,
          commission,
        });
      }
      break;
    }
  }

  const effectivePercent =
    totalSales > 0 ? (totalCommission / totalSales) * 100 : 0;

  return {
    userId: user.id,
    userName: user.name,
    totalSales,
    salesCount: sales.length,
    commissionAmount: totalCommission,
    commissionPercent: Math.round(effectivePercent * 100) / 100,
    ruleType: rule.type,
    details,
  };
}
