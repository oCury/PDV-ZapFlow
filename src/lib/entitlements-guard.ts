import { cache } from "react";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { planFromTenant, hasEntitlement, type EntitlementKey, type Plan } from "@/lib/entitlements";

/**
 * Current tenant's plan, derived from the signed session cookie's tenantId
 * (reliable in every route/page, unlike ambient AsyncLocalStorage context).
 * Fresh per request, memoized so nav + page guard share one read.
 */
export const currentPlan = cache(async (): Promise<Plan | null> => {
  const session = await getSession();
  if (!session?.tenantId) return null;
  const t = await basePrisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { plan: true },
  });
  if (!t) return null; // tenant deleted but session still valid → deny
  return planFromTenant(t.plan);
});

/** API guard: returns a NextResponse (401/403) on failure, or null to continue. */
export async function requireEntitlement(key: EntitlementKey): Promise<NextResponse | null> {
  const plan = await currentPlan();
  if (!plan) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!hasEntitlement(plan, key)) {
    return NextResponse.json(
      { success: false, error: "Recurso indisponível no seu plano", upgrade: true },
      { status: 403 },
    );
  }
  return null;
}

/** Page guard (server component): redirects to /upgrade when not entitled. */
export async function requireEntitlementPage(key: EntitlementKey): Promise<void> {
  const plan = await currentPlan();
  if (!plan) redirect("/login");
  if (!hasEntitlement(plan, key)) redirect(`/upgrade?feature=${key}`);
}
