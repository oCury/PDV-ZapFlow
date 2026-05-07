import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { calculateStaleProducts } from "@/lib/reports/stale-products";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  if (isNaN(days) || days < 1) {
    return NextResponse.json(
      { error: "Parametro 'days' deve ser um numero positivo." },
      { status: 400 }
    );
  }

  try {
    const result = await calculateStaleProducts({ days });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Reports] Stale Products error:", error);
    return NextResponse.json(
      { error: "Erro ao gerar relatorio de Produtos Parados." },
      { status: 500 }
    );
  }
}
