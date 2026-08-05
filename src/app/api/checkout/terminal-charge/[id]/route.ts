import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { pollCharge } from "@/lib/terminals/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  try {
    const result = await pollCharge(id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });
  }
}
