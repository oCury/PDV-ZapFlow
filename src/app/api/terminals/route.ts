import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const terminals = await prisma.paymentTerminal.findMany({
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json({ terminals });
}
