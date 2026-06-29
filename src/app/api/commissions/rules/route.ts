import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createCommissionRuleSchema } from "@/lib/validations/commissions";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gate = await requireEntitlement("commissions");
    if (gate) return gate;

    const userId = req.nextUrl.searchParams.get("userId");

    const rules = await prisma.commissionRule.findMany({
      where: {
        ...(userId ? { user_id: userId } : {}),
        active: true,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        category_rules: {
          include: { category: { select: { id: true, name: true } } },
        },
        tiers: { orderBy: { min_revenue: "asc" } },
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(rules);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao listar regras.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gate = await requireEntitlement("commissions");
    if (gate) return gate;

    const body = await req.json();
    const parsed = createCommissionRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const { userId, type, defaultPercent, categoryRules, tiers } = parsed.data;

    // Deactivate existing active rules for this user
    await prisma.commissionRule.updateMany({
      where: { user_id: userId, active: true },
      data: { active: false },
    });

    const rule = await prisma.commissionRule.create({
      data: {
        user_id: userId,
        type,
        default_percent: defaultPercent,
        active: true,
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

    return NextResponse.json(rule, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao criar regra.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
