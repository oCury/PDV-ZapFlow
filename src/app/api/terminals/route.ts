import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const terminals = await prisma.paymentTerminal.findMany({
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json({ terminals });
}
