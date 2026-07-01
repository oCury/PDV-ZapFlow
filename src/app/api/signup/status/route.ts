import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const order = new URL(req.url).searchParams.get("order");
  if (!order) return NextResponse.json({ status: "unknown" }, { status: 400 });
  const pending = await basePrisma.pendingSignup.findUnique({ where: { order_nsu: order } });
  if (!pending) return NextResponse.json({ status: "unknown" });
  if (pending.status === "pending") return NextResponse.json({ status: "pending" });
  // paid or consumed → establish the session for the created user (single-use auto-login)
  if (pending.created_user_id && pending.created_tenant_id) {
    const tenant = await basePrisma.tenant.findUnique({ where: { id: pending.created_tenant_id }, select: { paid_until: true } });
    await setSessionCookie({ userId: pending.created_user_id, role: "ADMIN", name: pending.name, tenantId: pending.created_tenant_id, paidUntil: tenant?.paid_until ? tenant.paid_until.toISOString() : null });
    if (pending.status !== "consumed") await basePrisma.pendingSignup.update({ where: { order_nsu: order }, data: { status: "consumed" } });
  }
  return NextResponse.json({ status: "ready" });
}
