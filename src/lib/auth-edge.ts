import { NextRequest } from "next/server";

const SESSION_COOKIE = "zf_session";
const SECRET = process.env.SESSION_SECRET ?? "";

interface SessionPayload {
  userId: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  tenantId: string;
  trialEndsAt?: string | null;
}

async function hmacSign(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  if (!SECRET) return null;
  const expected = await hmacSign(payload);
  if (expected !== signature) return null;

  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
