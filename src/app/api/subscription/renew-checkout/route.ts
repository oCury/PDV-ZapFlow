import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { priceForPlan, type PaidPlan } from "@/lib/billing/prices";
import { createCheckoutLink } from "@/lib/infinitepay/checkout";
import { planFromTenant } from "@/lib/entitlements";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const tenant = await basePrisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { name: true, plan: true },
  });
  if (!tenant) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const plan = planFromTenant(tenant.plan);
  if (plan !== "basic" && plan !== "pro")
    return NextResponse.json({ error: "Plano sob medida — fale com a gente." }, { status: 400 });

  const orderNsu = randomBytes(32).toString("hex");
  const amountCents = priceForPlan(plan as PaidPlan);

  await basePrisma.pendingSignup.create({
    data: {
      order_nsu: orderNsu,
      email: `renew+${session.tenantId}@zapflow.internal`,
      name: tenant.name,
      loja: tenant.name,
      password_hash: "-",
      plan,
      amount_cents: amountCents,
      status: "pending",
      created_tenant_id: session.tenantId,
      expires_at: new Date(Date.now() + 2 * 60 * 60_000),
    },
  });

  try {
    const { checkoutUrl } = await createCheckoutLink({
      orderNsu,
      amountCents,
      description: `Renovação ${plan === "pro" ? "Pro" : "Basic"} — PDV ZapFlow`,
    });
    return NextResponse.json({ checkout_url: checkoutUrl });
  } catch {
    await basePrisma.pendingSignup.deleteMany({ where: { order_nsu: orderNsu } });
    return NextResponse.json({ error: "Não foi possível iniciar o pagamento." }, { status: 502 });
  }
}
