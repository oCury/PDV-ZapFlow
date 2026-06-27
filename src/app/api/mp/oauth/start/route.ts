import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { buildAuthorizeUrl, createPkcePair } from "@/lib/mercadopago/oauth";
import { signState } from "@/lib/mercadopago/oauthState";
import { PKCE_COOKIE, pkceCookieOptions } from "@/lib/mercadopago/pkceCookie";

export async function GET() {
  const tenant = await requireTenant();
  if (!tenant) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });

  const { verifier, challenge } = createPkcePair();
  const state = signState({ tenantId: tenant.tenantId });
  const url = buildAuthorizeUrl({ state, codeChallenge: challenge });

  const res = NextResponse.redirect(url);
  res.cookies.set(PKCE_COOKIE, verifier, pkceCookieOptions);
  return res;
}
