import { createHash, randomBytes } from "crypto";

const AUTH_URL = "https://auth.mercadopago.com/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";

export interface MpTokens {
  accessToken: string;
  refreshToken: string;
  mpUserId: string;
  expiresInSeconds: number;
  publicKey?: string;
  scope?: string;
  tokenType?: string;
  liveMode: boolean;
}

function clientId(): string {
  const v = process.env.MP_OAUTH_CLIENT_ID;
  if (!v) throw new Error("MP_OAUTH_CLIENT_ID is not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.MP_OAUTH_CLIENT_SECRET;
  if (!v) throw new Error("MP_OAUTH_CLIENT_SECRET is not configured");
  return v;
}

function redirectUri(): string {
  const v = process.env.MP_OAUTH_REDIRECT_URI;
  if (!v) throw new Error("MP_OAUTH_REDIRECT_URI is not configured");
  return v;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a PKCE verifier (random) and its S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Build the MP authorization URL with PKCE and state. */
export function buildAuthorizeUrl(args: { state: string; codeChallenge: string }): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function mapTokens(raw: Record<string, unknown>): MpTokens {
  return {
    accessToken: String(raw.access_token),
    refreshToken: String(raw.refresh_token),
    mpUserId: String(raw.user_id),
    expiresInSeconds: Number(raw.expires_in ?? 0),
    publicKey: raw.public_key != null ? String(raw.public_key) : undefined,
    scope: raw.scope != null ? String(raw.scope) : undefined,
    tokenType: raw.token_type != null ? String(raw.token_type) : undefined,
    liveMode: Boolean(raw.live_mode),
  };
}

async function postToken(body: Record<string, unknown>): Promise<MpTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MP OAuth token ${res.status}: ${await res.text()}`);
  return mapTokens((await res.json()) as Record<string, unknown>);
}

/** Exchange an authorization code for tokens (includes code_verifier for PKCE). */
export function exchangeCodeForTokens(args: { code: string; codeVerifier: string }): Promise<MpTokens> {
  return postToken({
    grant_type: "authorization_code",
    client_id: clientId(),
    client_secret: clientSecret(),
    code: args.code,
    redirect_uri: redirectUri(),
    code_verifier: args.codeVerifier,
  });
}

/** Refresh an existing access token using the refresh_token grant. */
export function refreshTokens(args: { refreshToken: string }): Promise<MpTokens> {
  return postToken({
    grant_type: "refresh_token",
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: args.refreshToken,
  });
}
