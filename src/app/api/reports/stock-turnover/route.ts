import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { reportDateRangeSchema } from "@/lib/validations/reports";
import { calculateStockTurnover } from "@/lib/reports/stock-turnover";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = reportDateRangeSchema.safeParse({
    startDate: searchParams.get("startDate") ?? "",
    endDate: searchParams.get("endDate") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Parametros invalidos" },
      { status: 400 }
    );
  }

  try {
    const result = await calculateStockTurnover({
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(`${parsed.data.endDate}T23:59:59.999Z`),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Reports] Stock Turnover error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar relatorio de Giro de Estoque." },
      { status: 500 }
    );
  }
}
