import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createTableSchema } from "@/lib/validations/pos";

/** GET /api/tables — list all tables with current open order info */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tables = await prisma.table.findMany({
      orderBy: { number: "asc" },
      include: {
        sales: {
          where: { status: "OPEN" },
          select: {
            id: true,
            total_amount: true,
            created_at: true,
            _count: { select: { items: true } },
          },
          take: 1,
        },
      },
    });

    return NextResponse.json(
      tables.map((t) => ({
        ...t,
        openOrder: t.sales[0] ?? null,
        sales: undefined,
      }))
    );
  } catch (error) {
    console.error("Tables fetch failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** POST /api/tables — create a new table */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = createTableSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const { whatsapp, ...rest } = parsed.data;
    const whatsappClean = whatsapp?.replace(/\D/g, "");
    const data = {
      ...rest,
      ...(whatsappClean && whatsappClean.length >= 10 ? { whatsapp: whatsappClean } : {}),
    };
    const table = await prisma.table.create({ data });
    return NextResponse.json(table, { status: 201 });
  } catch (error: unknown) {
    const isDuplicate =
      error instanceof Error && error.message.includes("Unique constraint");
    return NextResponse.json(
      { error: isDuplicate ? "Número de mesa já existe" : "Erro interno" },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
