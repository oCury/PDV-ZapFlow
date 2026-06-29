import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Sale ID is required" }, { status: 400 });
  }

  const sale = await prisma.sale.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: sale.status,
    approved: sale.status === "APPROVED",
  });
}
