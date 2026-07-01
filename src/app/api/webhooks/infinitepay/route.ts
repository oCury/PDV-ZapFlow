import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { createTenantWithAdmin } from "@/lib/tenant/provision";
import { slugify } from "@/lib/signup";
import type { Plan } from "@/lib/entitlements";

const PERIOD_MS = 30 * 24 * 60 * 60_000; // ~1 month

export async function POST(req: Request) {
  let body: { order_nsu?: string; paid_amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const orderNsu = body.order_nsu;
  if (!orderNsu || typeof orderNsu !== "string") {
    return NextResponse.json({ ok: true });
  }

  const pending = await basePrisma.pendingSignup.findUnique({
    where: { order_nsu: orderNsu },
  });

  // Always respond 200 so InfinitePay stops retrying — only act on a valid,
  // first-time, amount-matching event.
  if (!pending) return NextResponse.json({ ok: true });

  // Idempotency: already processed
  if (pending.status !== "pending") return NextResponse.json({ ok: true });

  if (
    typeof body.paid_amount !== "number" ||
    body.paid_amount !== pending.amount_cents
  ) {
    console.error("[infinitepay] amount mismatch", {
      orderNsu,
      expected: pending.amount_cents,
      got: body.paid_amount,
    });
    return NextResponse.json({ ok: true });
  }

  try {
    if (pending.created_tenant_id) {
      const t = await basePrisma.tenant.findUnique({
        where: { id: pending.created_tenant_id },
        select: { paid_until: true },
      });
      const base =
        t?.paid_until && t.paid_until > new Date() ? t.paid_until.getTime() : Date.now();
      await basePrisma.tenant.update({
        where: { id: pending.created_tenant_id },
        data: { paid_until: new Date(base + PERIOD_MS) },
      });
      await basePrisma.pendingSignup.update({
        where: { order_nsu: orderNsu },
        data: { status: "paid" },
      });
      return NextResponse.json({ ok: true });
    }

    const result = await createTenantWithAdmin({
      name: pending.loja,
      slugBase: slugify(pending.loja),
      email: pending.email,
      passwordHash: pending.password_hash,
      plan: pending.plan as Plan,
      paidUntil: new Date(Date.now() + PERIOD_MS),
      adminName: pending.name,
    });

    await basePrisma.pendingSignup.update({
      where: { order_nsu: orderNsu },
      data: {
        status: "paid",
        created_tenant_id: result.tenantId,
        created_user_id: result.userId,
      },
    });
  } catch (err) {
    console.error("[infinitepay] provisioning failed after payment", { orderNsu, err });
  }

  return NextResponse.json({ ok: true });
}
