import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const TTL_SECONDS = 600; // 10 min
const SEPARATOR = ".";
const PARTS = 4; // tenantId.exp.nonce.sig

function secret(): string {
  const s = process.env.MP_OAUTH_STATE_SECRET ?? process.env.MP_OAUTH_CLIENT_SECRET;
  if (!s) throw new Error("MP_OAUTH_STATE_SECRET (or MP_OAUTH_CLIENT_SECRET) is not configured");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signParts(tenantId: string, exp: number, nonce: string): string {
  const msg = `${tenantId}${SEPARATOR}${exp}${SEPARATOR}${nonce}`;
  return b64url(createHmac("sha256", secret()).update(msg).digest());
}

/**
 * Produces a state token with format: `{tenantId}.{exp}.{nonce}.{sig}`.
 * The tenantId is plaintext so OAuth libraries can forward the opaque token.
 * `exp` override is for tests only.
 */
export function signState(data: { tenantId: string }, exp?: number): string {
  const nonce = b64url(randomBytes(12));
  const expiry = exp ?? Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = signParts(data.tenantId, expiry, nonce);
  return [data.tenantId, expiry, nonce, sig].join(SEPARATOR);
}

export function verifyState(state: string): { tenantId: string } {
  const parts = state.split(SEPARATOR);
  if (parts.length !== PARTS) throw new Error("Malformed state");
  const [tenantId, expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) throw new Error("Malformed state: invalid exp");

  const expected = signParts(tenantId, exp, nonce);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");

  if (exp < Math.floor(Date.now() / 1000)) throw new Error("State expired");

  return { tenantId };
}
