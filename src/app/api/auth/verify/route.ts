import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { createTenantWithAdmin } from "@/lib/tenant/provision";
import { slugify, TRIAL_DAYS } from "@/lib/signup";
import { setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let token: string | undefined;
  try { token = (await req.json()).token; } catch { /* ignore */ }
  if (!token) return NextResponse.json({ error: "Token ausente." }, { status: 400 });

  const pending = await basePrisma.pendingSignup.findUnique({ where: { token } });
  if (!pending) return NextResponse.json({ error: "Link inválido ou já utilizado." }, { status: 400 });
  if (pending.expires_at < new Date()) {
    await basePrisma.pendingSignup.delete({ where: { id: pending.id } });
    return NextResponse.json({ error: "Link expirado. Faça o cadastro novamente." }, { status: 410 });
  }
  // Race safety: email must still be free.
  const taken = await basePrisma.user.findUnique({ where: { email: pending.email }, select: { id: true } });
  if (taken) {
    await basePrisma.pendingSignup.delete({ where: { id: pending.id } });
    return NextResponse.json({ error: "Este e-mail já tem uma conta. Faça login." }, { status: 409 });
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60_000);
  const res = await createTenantWithAdmin({
    name: pending.loja, slugBase: slugify(pending.loja), email: pending.email,
    passwordHash: pending.password_hash, plan: pending.plan, trialEndsAt,
  });
  await basePrisma.pendingSignup.delete({ where: { id: pending.id } });

  await setSessionCookie({ userId: res.userId, role: "ADMIN", name: "Administrador", tenantId: res.tenantId, trialEndsAt: trialEndsAt.toISOString() });
  return NextResponse.json({ ok: true });
}
