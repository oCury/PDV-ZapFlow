import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { currentPlan } from "@/lib/entitlements-guard";
import { allowedKeys } from "@/lib/entitlements";
import { subscriptionStatus } from "@/lib/billing/status";
import { basePrisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const plan = (await currentPlan()) ?? "basic";
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { paid_until: true },
  });
  const subscription = subscriptionStatus(tenant?.paid_until ?? null);
  return NextResponse.json({
    user: { id: session.userId, name: session.name, role: session.role },
    plan,
    entitlements: allowedKeys(plan),
    subscription,
  });
}
