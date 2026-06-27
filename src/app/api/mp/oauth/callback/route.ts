import { NextResponse } from "next/server";
import { verifyState } from "@/lib/mercadopago/oauthState";
import { exchangeCodeForTokens } from "@/lib/mercadopago/oauth";
import { saveConnection } from "@/lib/mercadopago/connection";
import { PKCE_COOKIE, pkceCookieOptions } from "@/lib/mercadopago/pkceCookie";

function settings(req: Request, status: "connected" | "error", reason?: string) {
  const url = new URL("/settings/terminals", new URL(req.url).origin);
  url.searchParams.set("mp", status);
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const error = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  if (error || !code || !state) {
    return NextResponse.redirect(settings(req, "error", error ?? "missing_code"));
  }

  try {
    const { tenantId } = verifyState(state);
    const verifier = req.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${PKCE_COOKIE}=`))
      ?.slice(PKCE_COOKIE.length + 1);
    if (!verifier) return NextResponse.redirect(settings(req, "error", "missing_pkce"));

    const tokens = await exchangeCodeForTokens({ code, codeVerifier: verifier });
    await saveConnection(tenantId, tokens);

    const res = NextResponse.redirect(settings(req, "connected"));
    res.cookies.set(PKCE_COOKIE, "", { ...pkceCookieOptions, maxAge: 0 });
    return res;
  } catch {
    return NextResponse.redirect(settings(req, "error", "exchange_failed"));
  }
}
