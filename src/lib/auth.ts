import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import { cookies } from "next/headers";
import { enterTenant } from "./tenant/context";
import { basePrisma } from "./prisma";

export const SESSION_COOKIE = "zf_session";

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET environment variable is required. Set it in .env");
  return s;
}

const SECRET = getSecret();

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [salt, hash] = parts;
  const hashBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = scryptSync(password, salt, 64);
  return timingSafeEqual(hashBuffer, derivedBuffer);
}

interface SessionPayload {
  userId: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  tenantId: string;
  trialEndsAt?: string | null; // ISO string; absent/null => no trial limit
}

function sign(payload: string): string {
  const hmac = createHmac("sha256", SECRET);
  hmac.update(payload);
  return hmac.digest("hex");
}

export function createSessionToken(data: SessionPayload): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function parseSessionToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = Buffer.from(sign(payload), "hex");
  const actual = Buffer.from(signature, "hex");
  // Reject if raw signature string contains non-hex chars or odd length (Buffer.from silently drops them).
  if (actual.length * 2 !== signature.length || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch (e) {
    console.warn("[auth] parseSessionToken: payload decode failed", e);
    return null;
  }
}

export async function setSessionCookie(data: SessionPayload) {
  const token = createSessionToken(data);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = parseSessionToken(token);
  return session;
}

export async function getSessionUser() {
  const session = await getSession();
  if (!session) return null;

  // UNSCOPED lookup by id, then establish tenant context for the rest of the request.
  const user = await basePrisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, active: true, tenant_id: true },
  });

  if (!user || !user.active || !user.tenant_id) return null;
  enterTenant(user.tenant_id);
  return user;
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

/** Resolve + bind the current tenant from the session. Returns null if unauthenticated. */
export async function requireTenant(): Promise<
  { tenantId: string; userId: string; role: "ADMIN" | "EMPLOYEE" } | null
> {
  const session = await getSession();
  if (!session?.tenantId) return null;
  enterTenant(session.tenantId);
  return { tenantId: session.tenantId, userId: session.userId, role: session.role };
}
