import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createSalesGoalSchema } from "@/lib/validations/commissions";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = req.nextUrl.searchParams.get("userId");

    const goals = await prisma.salesGoal.findMany({
      where: userId ? { user_id: userId } : {},
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(goals);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao listar metas.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSalesGoalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const { userId, period, target, startDate, endDate } = parsed.data;

    const goal = await prisma.salesGoal.create({
      data: {
        user_id: userId,
        period,
        target,
        start_date: new Date(startDate),
        end_date: new Date(endDate),
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao criar meta.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
