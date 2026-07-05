import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cancelCharge } from "@/lib/terminals/service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const result = await cancelCharge(id);
  return NextResponse.json(result);
}
