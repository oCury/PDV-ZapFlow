import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { commissionQuerySchema } from "@/lib/validations/commissions";
import { calculateCommission } from "@/lib/commissions/calculate";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gate = await requireEntitlement("commissions");
    if (gate) return gate;

    const searchParams = req.nextUrl.searchParams;
    const parsed = commissionQuerySchema.safeParse({
      userId: searchParams.get("userId") ?? "",
      startDate: searchParams.get("startDate") ?? "",
      endDate: searchParams.get("endDate") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Parâmetros inválidos" },
        { status: 400 }
      );
    }

    const { userId, startDate, endDate } = parsed.data;

    const result = await calculateCommission(
      userId,
      new Date(startDate),
      new Date(endDate)
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao calcular comissão.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
