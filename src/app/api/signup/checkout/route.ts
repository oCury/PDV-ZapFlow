import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { basePrisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { validateSignup, type SignupInput } from "@/lib/signup";
import { priceForPlan, type PaidPlan } from "@/lib/billing/prices";
import { createCheckoutLink } from "@/lib/infinitepay/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { corsHeaders } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (!rateLimit(`checkout:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: cors },
    );
  }

  let body: SignupInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Requisição inválida." },
      { status: 400, headers: cors },
    );
  }

  const v = validateSignup(body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400, headers: cors });
  }

  const email = body.email.toLowerCase().trim();
  const existing = await basePrisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Este e-mail já tem uma conta. Faça login." },
      { status: 409, headers: cors },
    );
  }

  const orderNsu = randomBytes(32).toString("hex");
  const plan = body.plan as PaidPlan;
  const amountCents = priceForPlan(plan);

  await basePrisma.pendingSignup.create({
    data: {
      order_nsu: orderNsu,
      email,
      name: body.name.trim(),
      loja: body.loja.trim(),
      password_hash: hashPassword(body.password),
      plan,
      amount_cents: amountCents,
      status: "pending",
      expires_at: new Date(Date.now() + 2 * 60 * 60_000),
    },
  });

  try {
    const { checkoutUrl, invoiceSlug } = await createCheckoutLink({
      orderNsu,
      amountCents,
      description: `Assinatura ${plan === "pro" ? "Pro" : "Basic"} — PDV ZapFlow`,
    });
    await basePrisma.pendingSignup.update({
      where: { order_nsu: orderNsu },
      data: { invoice_slug: invoiceSlug },
    });
    return NextResponse.json({ checkout_url: checkoutUrl }, { headers: cors });
  } catch {
    await basePrisma.pendingSignup.deleteMany({ where: { order_nsu: orderNsu } });
    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento. Tente novamente." },
      { status: 502, headers: cors },
    );
  }
}
