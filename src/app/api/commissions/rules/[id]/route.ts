import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createCommissionRuleSchema } from "@/lib/validations/commissions";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = createCommissionRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const { userId, type, defaultPercent, categoryRules, tiers } = parsed.data;

    const existing = await prisma.commissionRule.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Regra não encontrada" },
        { status: 404 }
      );
    }

    // Delete old category_rules and tiers, then recreate
    await prisma.commissionCategoryRule.deleteMany({
      where: { commission_rule_id: id },
    });
    await prisma.commissionTier.deleteMany({
      where: { commission_rule_id: id },
    });

    const rule = await prisma.commissionRule.update({
      where: { id },
      data: {
        user_id: userId,
        type,
        default_percent: defaultPercent,
        category_rules:
          type === "CATEGORY_PERCENT" && categoryRules?.length
            ? {
                create: categoryRules.map((cr) => ({
                  category_id: cr.categoryId,
                  percent: cr.percent,
                })),
              }
            : undefined,
        tiers:
          type === "TIERED" && tiers?.length
            ? {
                create: tiers.map((t) => ({
                  min_revenue: t.minRevenue,
                  max_revenue: t.maxRevenue ?? null,
                  percent: t.percent,
                })),
              }
            : undefined,
      },
      include: {
        user: { select: { id: true, name: true } },
        category_rules: {
          include: { category: { select: { id: true, name: true } } },
        },
        tiers: { orderBy: { min_revenue: "asc" } },
      },
    });

    return NextResponse.json(rule);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao atualizar regra.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.commissionRule.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Regra não encontrada" },
        { status: 404 }
      );
    }

    await prisma.commissionRule.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao remover regra.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
