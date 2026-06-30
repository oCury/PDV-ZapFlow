import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { basePrisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { validateSignup, type SignupInput } from "@/lib/signup";
import { sendVerificationEmail } from "@/lib/email/resend";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });
  }
  let body: SignupInput;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requisição inválida." }, { status: 400 }); }
  const v = validateSignup(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const email = body.email.toLowerCase().trim();
  const existingUser = await basePrisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) return NextResponse.json({ error: "Este e-mail já tem uma conta. Faça login." }, { status: 409 });

  const token = randomBytes(32).toString("hex");
  const expires_at = new Date(Date.now() + 24 * 60 * 60_000);
  // Upsert the pending signup (one per email): replace any prior pending row.
  await basePrisma.pendingSignup.upsert({
    where: { email },
    update: { token, name: body.name.trim(), loja: body.loja.trim(), password_hash: hashPassword(body.password), plan: body.plan as never, expires_at },
    create: { email, token, name: body.name.trim(), loja: body.loja.trim(), password_hash: hashPassword(body.password), plan: body.plan as never, expires_at },
  });

  const appUrl = process.env.APP_URL ?? "https://pdv-zap-flow.vercel.app";
  try {
    await sendVerificationEmail({ to: email, name: body.name.trim(), link: `${appUrl}/verify?token=${token}` });
  } catch {
    await basePrisma.pendingSignup.deleteMany({ where: { email } }); // roll back so they can retry
    return NextResponse.json({ error: "Não foi possível enviar o e-mail. Tente novamente." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message: "Confirme seu e-mail para ativar o teste." });
}
