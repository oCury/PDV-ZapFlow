import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  try {
    const where = status ? { status } : {};

    const items = await prisma.fiscalQueue.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        sale: {
          select: {
            id: true,
            total_amount: true,
            created_at: true,
          },
        },
      },
    });

    return NextResponse.json(
      items.map((item) => ({
        ...item,
        sale: {
          ...item.sale,
          total_amount: Number(item.sale.total_amount),
        },
      }))
    );
  } catch (error) {
    console.error("[Fiscal] Error listing queue:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar fila." },
      { status: 500 }
    );
  }
}
