import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { expireVouchers } from "@/lib/vouchers/service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  // Allow either a valid session (admin) or a cron secret header
  const authHeader = req.headers.get("authorization");

  if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
    // Authorized via cron secret
  } else {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const count = await expireVouchers();

    return NextResponse.json({
      expired: count,
      message: `${count} vale(s) expirado(s).`,
    });
  } catch (error) {
    console.error("[Cron] Error expiring vouchers:", error);
    return NextResponse.json(
      { error: "Erro ao expirar vales." },
      { status: 500 }
    );
  }
}
