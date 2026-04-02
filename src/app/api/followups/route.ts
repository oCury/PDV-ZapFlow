import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFollowupStats, getRecentFollowups } from "@/lib/followup/followup-service";

/**
 * GET /api/followups
 * 
 * Returns follow-up statistics and recent history
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [stats, recent] = await Promise.all([
      getFollowupStats(),
      getRecentFollowups(50),
    ]);

    return NextResponse.json({
      stats,
      recent: recent.map((f) => ({
        id: f.id,
        customerId: f.customer_id,
        customerName: f.customer.name,
        customerPhone: f.customer.phone,
        saleId: f.sale_id,
        saleAmount: Number(f.sale.total_amount),
        saleDate: f.sale.created_at,
        cashbackAmount: Number(f.cashback_amount),
        pointsAdded: f.points_added,
        status: f.whatsapp_status,
        sentAt: f.sent_at,
        type: f.type,
      })),
    });
  } catch (error) {
    console.error("[Followups API] Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de follow-up" },
      { status: 500 }
    );
  }
}
