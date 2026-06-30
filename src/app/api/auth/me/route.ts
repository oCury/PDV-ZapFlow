import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { currentPlan } from "@/lib/entitlements-guard";
import { allowedKeys } from "@/lib/entitlements";
import { trialStatus } from "@/lib/signup";
import { basePrisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const plan = (await currentPlan()) ?? "basic";
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { trial_ends_at: true },
  });
  const trial = trialStatus(tenant?.trial_ends_at ?? null);
  return NextResponse.json({
    user: { id: session.userId, name: session.name, role: session.role },
    plan,
    entitlements: allowedKeys(plan),
    trial,
  });
}
