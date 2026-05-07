import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { reportDateRangeSchema } from "@/lib/validations/reports";
import { calculateAbcCurve } from "@/lib/reports/abc-curve";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = reportDateRangeSchema.safeParse({
    startDate: searchParams.get("startDate") ?? "",
    endDate: searchParams.get("endDate") ?? "",
    categoryId: searchParams.get("categoryId") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Parametros invalidos" },
      { status: 400 }
    );
  }

  try {
    const result = await calculateAbcCurve({
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(`${parsed.data.endDate}T23:59:59.999Z`),
      categoryId: parsed.data.categoryId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Reports] ABC Curve error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar relatorio Curva ABC." },
      { status: 500 }
    );
  }
}
