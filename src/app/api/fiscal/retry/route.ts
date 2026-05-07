import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { FiscalService } from "@/lib/fiscal/FiscalService";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await FiscalService.processQueue();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Fiscal] Error processing queue:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar fila." },
      { status: 500 }
    );
  }
}
