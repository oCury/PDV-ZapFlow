import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getNumericSetting, getSetting } from "@/lib/settings";

/** GET /api/cashback — list customers with cashback info */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [cashbackPercent, storeName, whatsappInstance, cashbackMessage] = await Promise.all([
      getNumericSetting("cashback_percent"),
      getSetting("store_name"),
      getSetting("whatsapp_instance"),
      getSetting("cashback_message"),
    ]);

    const customers = await prisma.customer.findMany({
      where: {
        sales: { some: { status: "APPROVED" } },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        whatsapp: true,
        loyalty_points: true,
        sales: {
          where: { status: "APPROVED" },
          select: {
            id: true,
            total_amount: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
        },
        followups: {
          select: {
            cashback_amount: true,
            points_added: true,
          },
        },
      },
      orderBy: { loyalty_points: "desc" },
    });

    const result = customers.map((c) => {
      const totalSpent = c.sales.reduce(
        (sum, s) => sum + Number(s.total_amount),
        0
      );
      const totalCashbackEarned = c.followups.reduce(
        (sum, f) => sum + Number(f.cashback_amount),
        0
      );
      const lastPurchase = c.sales[0]?.created_at || null;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        whatsapp: c.whatsapp,
        loyalty_points: c.loyalty_points,
        total_spent: totalSpent,
        total_cashback_earned: totalCashbackEarned,
        total_purchases: c.sales.length,
        last_purchase: lastPurchase,
      };
    });

    return NextResponse.json({
      customers: result,
      config: {
        cashback_percent: cashbackPercent,
        store_name: storeName || "Sua Loja",
        whatsapp_instance: whatsappInstance || "",
        cashback_message: cashbackMessage || "",
      },
    });
  } catch (error) {
    console.error("Cashback fetch failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
