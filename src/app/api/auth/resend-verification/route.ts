import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { basePrisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email/resend";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`resend:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ ok: true }); // do not reveal rate state
  }
  let email: string | undefined;
  try { email = (await req.json()).email?.toLowerCase().trim(); } catch { /* ignore */ }
  if (email) {
    const pending = await basePrisma.pendingSignup.findUnique({ where: { email } });
    if (pending) {
      const token = randomBytes(32).toString("hex");
      await basePrisma.pendingSignup.update({ where: { email }, data: { token, expires_at: new Date(Date.now() + 24 * 60 * 60_000) } });
      const appUrl = process.env.APP_URL ?? "https://pdv-zap-flow.vercel.app";
      try { await sendVerificationEmail({ to: email, name: pending.name, link: `${appUrl}/verify?token=${token}` }); } catch { /* swallow to avoid enumeration */ }
    }
  }
  return NextResponse.json({ ok: true }); // always 200 (no email enumeration)
}
