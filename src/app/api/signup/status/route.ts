import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { getSession, setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const order = new URL(req.url).searchParams.get("order");
  if (!order) return NextResponse.json({ status: "unknown" }, { status: 400 });
  const pending = await basePrisma.pendingSignup.findUnique({ where: { order_nsu: order } });
  if (!pending) return NextResponse.json({ status: "unknown" });
  if (pending.status === "pending") return NextResponse.json({ status: "pending" });

  // New-signup auto-login: single-use — only mint a session on the paid→consumed transition.
  if (pending.created_user_id && pending.created_tenant_id) {
    if (pending.status === "paid") {
      const tenant = await basePrisma.tenant.findUnique({ where: { id: pending.created_tenant_id }, select: { paid_until: true } });
      await setSessionCookie({ userId: pending.created_user_id, role: "ADMIN", name: pending.name, tenantId: pending.created_tenant_id, paidUntil: tenant?.paid_until ? tenant.paid_until.toISOString() : null });
      await basePrisma.pendingSignup.update({ where: { order_nsu: order }, data: { status: "consumed" } });
    }
    // status === "consumed": already logged in once — do NOT re-mint (single-use).
    return NextResponse.json({ status: "ready" });
  }

  // Renewal: refresh the authenticated session's cookie with the extended paid_until.
  // (created_tenant_id set, created_user_id null — renewal pending)
  if (pending.created_tenant_id) {
    const session = await getSession();
    if (session && session.tenantId === pending.created_tenant_id) {
      const tenant = await basePrisma.tenant.findUnique({ where: { id: pending.created_tenant_id }, select: { paid_until: true } });
      await setSessionCookie({ userId: session.userId, role: session.role, name: session.name, tenantId: session.tenantId, paidUntil: tenant?.paid_until ? tenant.paid_until.toISOString() : null });
    }
    return NextResponse.json({ status: "ready" });
  }

  return NextResponse.json({ status: "ready" });
}
