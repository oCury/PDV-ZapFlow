import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { periodComparisonSchema } from "@/lib/validations/reports";
import { calculatePeriodComparison } from "@/lib/reports/period-comparison";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("reports.advanced");
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const parsed = periodComparisonSchema.safeParse({
    period1Start: searchParams.get("period1Start") ?? "",
    period1End: searchParams.get("period1End") ?? "",
    period2Start: searchParams.get("period2Start") ?? "",
    period2End: searchParams.get("period2End") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Parametros invalidos" },
      { status: 400 }
    );
  }

  try {
    const result = await calculatePeriodComparison({
      period1Start: new Date(parsed.data.period1Start),
      period1End: new Date(`${parsed.data.period1End}T23:59:59.999Z`),
      period2Start: new Date(parsed.data.period2Start),
      period2End: new Date(`${parsed.data.period2End}T23:59:59.999Z`),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Reports] Period Comparison error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar relatorio Comparativo de Periodos." },
      { status: 500 }
    );
  }
}
