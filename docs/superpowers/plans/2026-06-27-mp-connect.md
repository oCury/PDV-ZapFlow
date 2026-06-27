# Mercado Pago Connect (per-tenant OAuth) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `MERCADOPAGO_ACCESS_TOKEN` with per-tenant Mercado Pago OAuth credentials, so each loja connects its own MP account and uses its own maquininha.

**Architecture:** A "Conectar Mercado Pago" OAuth flow fills the existing `MpConnection` row (one per tenant) with encrypted tokens. A `resolveMpAccessToken(tenantId)` resolver (lazy refresh + interim env fallback) feeds the token explicitly into `mpFetch` (Option A — explicit threading). Webhooks map MP's collector `user_id → tenant` and reconcile inside that tenant's context.

**Tech Stack:** Next.js 15 (App Router, route handlers), Prisma 6 (`basePrisma` unscoped + `prisma` tenant-scoped extension), Node `crypto` (AES-256-GCM, HMAC, PKCE), Vitest 3.

**Design spec:** `docs/superpowers/specs/2026-06-27-mp-connect-design.md`

**Base/worktree:** branch `feat/mp-connect` off `origin/main` (has `MpConnection` from PR #6). No Prisma schema change. No prod DB migration.

**Conventions:**
- Run a single test file: `npm test -- src/lib/path/file.test.ts`
- Run all tests: `npm test` · Type/build check: `npm run build`
- Tests mock the network/`mpFetch` (see existing `src/lib/mercadopago/orders.test.ts`).
- New env vars (NOT committed; add to Vercel later with go-ahead): `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET`, `MP_OAUTH_REDIRECT_URI`, `MP_TOKEN_ENC_KEY` (32-byte hex), optional `MP_OAUTH_STATE_SECRET`. `MERCADOPAGO_ACCESS_TOKEN` is reused as interim fallback.

---

## Task 1: Token encryption (`secretBox`)

AES-256-GCM encrypt/decrypt for MP tokens at rest. Versioned envelope `v1:<iv_hex>:<tag_hex>:<ct_hex>`.

**Files:**
- Create: `src/lib/crypto/secretBox.ts`
- Test: `src/lib/crypto/secretBox.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/crypto/secretBox.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { encryptSecret, decryptSecret } from "./secretBox";

// 32-byte key as 64 hex chars
const KEY = "0".repeat(64);

beforeEach(() => {
  process.env.MP_TOKEN_ENC_KEY = KEY;
});

describe("secretBox", () => {
  it("round-trips plaintext", () => {
    const ct = encryptSecret("APP_USR-super-secret");
    expect(ct).not.toContain("super-secret");
    expect(ct.startsWith("v1:")).toBe(true);
    expect(decryptSecret(ct)).toBe("APP_USR-super-secret");
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("rejects a tampered ciphertext", () => {
    const ct = encryptSecret("hello");
    const parts = ct.split(":");
    parts[3] = parts[3].replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("throws on a malformed key", () => {
    process.env.MP_TOKEN_ENC_KEY = "not-hex";
    expect(() => encryptSecret("x")).toThrow(/MP_TOKEN_ENC_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/crypto/secretBox.test.ts`
Expected: FAIL — cannot find module `./secretBox`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/crypto/secretBox.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const hex = process.env.MP_TOKEN_ENC_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("MP_TOKEN_ENC_KEY must be 32 bytes of hex (64 hex chars)");
  }
  return Buffer.from(hex, "hex");
}

/** AES-256-GCM. Output: `v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("hex"), tag.toString("hex"), ct.toString("hex")].join(":");
}

export function decryptSecret(envelope: string): string {
  const [version, ivHex, tagHex, ctHex] = envelope.split(":");
  if (version !== VERSION || !ivHex || !tagHex || !ctHex) {
    throw new Error("Malformed secret envelope");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/crypto/secretBox.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto/secretBox.ts src/lib/crypto/secretBox.test.ts
git commit -m "feat: AES-256-GCM secretBox for encrypting MP tokens at rest"
```

---

## Task 2: OAuth `state` signing

HMAC-signed, TTL-bound state that binds the OAuth callback to the initiating tenant (CSRF defense).

**Files:**
- Create: `src/lib/mercadopago/oauthState.ts`
- Test: `src/lib/mercadopago/oauthState.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mercadopago/oauthState.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { signState, verifyState } from "./oauthState";

beforeEach(() => {
  process.env.MP_OAUTH_STATE_SECRET = "test-state-secret";
});

describe("oauthState", () => {
  it("signs and verifies, recovering the tenantId", () => {
    const state = signState({ tenantId: "tenant_123" });
    expect(verifyState(state)).toEqual({ tenantId: "tenant_123" });
  });

  it("rejects a tampered state", () => {
    const state = signState({ tenantId: "tenant_123" });
    const tampered = state.replace("tenant_123", "tenant_999");
    expect(() => verifyState(tampered)).toThrow();
  });

  it("rejects an expired state", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const state = signState({ tenantId: "tenant_123" }, past);
    expect(() => verifyState(state)).toThrow(/expired/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/mercadopago/oauthState.test.ts`
Expected: FAIL — cannot find module `./oauthState`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/mercadopago/oauthState.ts
import { createHmac, timingSafeEqual } from "crypto";

const TTL_SECONDS = 600; // 10 min

function secret(): string {
  const s = process.env.MP_OAUTH_STATE_SECRET ?? process.env.MP_OAUTH_CLIENT_SECRET;
  if (!s) throw new Error("MP_OAUTH_STATE_SECRET (or MP_OAUTH_CLIENT_SECRET) is not configured");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", secret()).update(payloadB64).digest());
}

/** `exp` override is for tests only. */
export function signState(data: { tenantId: string }, exp?: number): string {
  const payload = {
    tenantId: data.tenantId,
    nonce: b64url(createHmac("sha256", secret()).update(`${data.tenantId}:${exp ?? Date.now()}`).digest()).slice(0, 16),
    exp: exp ?? Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyState(state: string): { tenantId: string } {
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) throw new Error("Malformed state");
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid state signature");
  const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("State expired");
  }
  return { tenantId: String(payload.tenantId) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/mercadopago/oauthState.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mercadopago/oauthState.ts src/lib/mercadopago/oauthState.test.ts
git commit -m "feat: HMAC-signed TTL-bound OAuth state (CSRF + tenant binding)"
```

---

## Task 3: OAuth client (authorize URL, code exchange, refresh, PKCE)

**Files:**
- Create: `src/lib/mercadopago/oauth.ts`
- Test: `src/lib/mercadopago/oauth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mercadopago/oauth.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { buildAuthorizeUrl, createPkcePair, exchangeCodeForTokens, refreshTokens } from "./oauth";

beforeEach(() => {
  process.env.MP_OAUTH_CLIENT_ID = "app-123";
  process.env.MP_OAUTH_CLIENT_SECRET = "secret-xyz";
  process.env.MP_OAUTH_REDIRECT_URI = "https://app.example.com/api/mp/oauth/callback";
});
afterEach(() => vi.restoreAllMocks());

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, state, and S256 PKCE challenge", () => {
    const url = new URL(buildAuthorizeUrl({ state: "STATE", codeChallenge: "CHALLENGE" }));
    expect(url.origin + url.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(url.searchParams.get("client_id")).toBe("app-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("platform_id")).toBe("mp");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/mp/oauth/callback");
    expect(url.searchParams.get("state")).toBe("STATE");
    expect(url.searchParams.get("code_challenge")).toBe("CHALLENGE");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("createPkcePair", () => {
  it("produces a verifier and a matching S256 challenge", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toBe(verifier);
  });
});

describe("exchangeCodeForTokens", () => {
  it("POSTs authorization_code and maps the response", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "AT", refresh_token: "RT", user_id: 555,
          expires_in: 15552000, public_key: "PK", scope: "read write offline_access",
          token_type: "bearer", live_mode: true,
        }),
        { status: 200 }
      )
    );
    const res = await exchangeCodeForTokens({ code: "CODE", codeVerifier: "VER" });
    expect(res.accessToken).toBe("AT");
    expect(res.refreshToken).toBe("RT");
    expect(res.mpUserId).toBe("555");
    expect(res.expiresInSeconds).toBe(15552000);
    expect(res.liveMode).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/oauth/token");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.grant_type).toBe("authorization_code");
    expect(body.client_id).toBe("app-123");
    expect(body.client_secret).toBe("secret-xyz");
    expect(body.code).toBe("CODE");
    expect(body.code_verifier).toBe("VER");
  });

  it("throws on a non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    await expect(exchangeCodeForTokens({ code: "x", codeVerifier: "y" })).rejects.toThrow();
  });
});

describe("refreshTokens", () => {
  it("POSTs refresh_token grant", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "AT2", refresh_token: "RT2", user_id: 555, expires_in: 100 }),
        { status: 200 }
      )
    );
    const res = await refreshTokens({ refreshToken: "RT" });
    expect(res.accessToken).toBe("AT2");
    expect(res.refreshToken).toBe("RT2");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.grant_type).toBe("refresh_token");
    expect(body.refresh_token).toBe("RT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/mercadopago/oauth.test.ts`
Expected: FAIL — cannot find module `./oauth`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/mercadopago/oauth.ts
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

/** PKCE verifier (random) + S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

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

export function refreshTokens(args: { refreshToken: string }): Promise<MpTokens> {
  return postToken({
    grant_type: "refresh_token",
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: args.refreshToken,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/mercadopago/oauth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mercadopago/oauth.ts src/lib/mercadopago/oauth.test.ts
git commit -m "feat: MP OAuth client — authorize URL, PKCE, code exchange, refresh"
```

---

## Task 4: Per-tenant connection resolver

`resolveMpAccessToken` (lazy refresh + interim env fallback), `saveConnection`, `deleteConnection`, `getConnectionStatus`, and the typed `MpNotConnectedError`. Uses `basePrisma` (connection rows are looked up by `tenant_id`/`mp_user_id`, deliberately unscoped).

**Files:**
- Create: `src/lib/mercadopago/connection.ts`
- Test: `src/lib/mercadopago/connection.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mercadopago/connection.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  basePrisma: {
    mpConnection: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("./oauth", () => ({ refreshTokens: vi.fn() }));
vi.mock("@/lib/crypto/secretBox", () => ({
  encryptSecret: (s: string) => `enc(${s})`,
  decryptSecret: (s: string) => s.replace(/^enc\((.*)\)$/, "$1"),
}));

import { basePrisma } from "@/lib/prisma";
import { refreshTokens } from "./oauth";
import {
  resolveMpAccessToken,
  saveConnection,
  MpNotConnectedError,
} from "./connection";

const findUnique = basePrisma.mpConnection.findUnique as unknown as ReturnType<typeof vi.fn>;
const update = basePrisma.mpConnection.update as unknown as ReturnType<typeof vi.fn>;
const upsert = basePrisma.mpConnection.upsert as unknown as ReturnType<typeof vi.fn>;
const refreshMock = refreshTokens as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
});

describe("resolveMpAccessToken", () => {
  it("falls back to the env token when the tenant has no connection", async () => {
    findUnique.mockResolvedValue(null);
    process.env.MERCADOPAGO_ACCESS_TOKEN = "ENV_TOKEN";
    expect(await resolveMpAccessToken("t1")).toBe("ENV_TOKEN");
  });

  it("throws MpNotConnectedError when unconnected and no env fallback", async () => {
    findUnique.mockResolvedValue(null);
    await expect(resolveMpAccessToken("t1")).rejects.toBeInstanceOf(MpNotConnectedError);
  });

  it("returns the decrypted token when it is not near expiry", async () => {
    findUnique.mockResolvedValue({
      tenant_id: "t1",
      access_token: "enc(LIVE_AT)",
      refresh_token: "enc(RT)",
      access_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 72), // 72h out
    });
    expect(await resolveMpAccessToken("t1")).toBe("LIVE_AT");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes and persists the rotated tokens when near expiry", async () => {
    findUnique.mockResolvedValue({
      tenant_id: "t1",
      access_token: "enc(OLD_AT)",
      refresh_token: "enc(OLD_RT)",
      access_token_expires_at: new Date(Date.now() + 1000 * 60), // 1 min out → refresh
    });
    refreshMock.mockResolvedValue({
      accessToken: "NEW_AT", refreshToken: "NEW_RT", mpUserId: "555",
      expiresInSeconds: 15552000, liveMode: true,
    });
    update.mockResolvedValue({});
    expect(await resolveMpAccessToken("t1")).toBe("NEW_AT");
    expect(refreshMock).toHaveBeenCalledWith({ refreshToken: "OLD_RT" });
    const data = update.mock.calls[0][0].data;
    expect(data.access_token).toBe("enc(NEW_AT)");
    expect(data.refresh_token).toBe("enc(NEW_RT)");
  });
});

describe("saveConnection", () => {
  it("upserts an encrypted connection for the tenant", async () => {
    upsert.mockResolvedValue({});
    await saveConnection("t1", {
      accessToken: "AT", refreshToken: "RT", mpUserId: "555",
      expiresInSeconds: 15552000, publicKey: "PK", scope: "read", tokenType: "bearer", liveMode: true,
    });
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ tenant_id: "t1" });
    expect(args.create.access_token).toBe("enc(AT)");
    expect(args.create.refresh_token).toBe("enc(RT)");
    expect(args.create.mp_user_id).toBe("555");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/mercadopago/connection.test.ts`
Expected: FAIL — cannot find module `./connection`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/mercadopago/connection.ts
import { basePrisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretBox";
import { refreshTokens, type MpTokens } from "./oauth";

/** Refresh when the access token expires within this window. */
const REFRESH_BUFFER_MS = 1000 * 60 * 60 * 24; // 24h

export class MpNotConnectedError extends Error {
  constructor(public tenantId: string) {
    super(`Tenant ${tenantId} has no Mercado Pago connection`);
    this.name = "MpNotConnectedError";
  }
}

function connectionData(tokens: MpTokens) {
  return {
    mp_user_id: tokens.mpUserId,
    access_token: encryptSecret(tokens.accessToken),
    refresh_token: encryptSecret(tokens.refreshToken),
    public_key: tokens.publicKey ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.tokenType ?? null,
    live_mode: tokens.liveMode,
    access_token_expires_at: new Date(Date.now() + tokens.expiresInSeconds * 1000),
  };
}

export async function saveConnection(tenantId: string, tokens: MpTokens): Promise<void> {
  const data = connectionData(tokens);
  await basePrisma.mpConnection.upsert({
    where: { tenant_id: tenantId },
    create: { tenant_id: tenantId, ...data },
    update: data,
  });
}

export async function deleteConnection(tenantId: string): Promise<void> {
  await basePrisma.mpConnection.delete({ where: { tenant_id: tenantId } }).catch(() => {});
}

export async function getConnectionStatus(
  tenantId: string
): Promise<{ connected: boolean; mpUserId?: string; liveMode?: boolean; scope?: string }> {
  const conn = await basePrisma.mpConnection.findUnique({ where: { tenant_id: tenantId } });
  if (!conn) return { connected: false };
  return { connected: true, mpUserId: conn.mp_user_id, liveMode: conn.live_mode, scope: conn.scope ?? undefined };
}

/**
 * Resolve the access token for a tenant. Refreshes (and persists rotated tokens) when near expiry.
 * Falls back to the env token for tenants without a connection (interim, removable once all connect).
 */
export async function resolveMpAccessToken(tenantId: string): Promise<string> {
  const conn = await basePrisma.mpConnection.findUnique({ where: { tenant_id: tenantId } });

  if (!conn) {
    const envToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (envToken) return envToken;
    throw new MpNotConnectedError(tenantId);
  }

  const expiresAt = conn.access_token_expires_at?.getTime() ?? 0;
  const nearExpiry = expiresAt - Date.now() < REFRESH_BUFFER_MS;

  if (nearExpiry) {
    const refreshed = await refreshTokens({ refreshToken: decryptSecret(conn.refresh_token) });
    await basePrisma.mpConnection.update({
      where: { tenant_id: tenantId },
      data: connectionData(refreshed),
    });
    return refreshed.accessToken;
  }

  return decryptSecret(conn.access_token);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/mercadopago/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mercadopago/connection.ts src/lib/mercadopago/connection.test.ts
git commit -m "feat: per-tenant MP token resolver (lazy refresh + env fallback)"
```

---

## Task 5: Thread the per-tenant token into MP calls (Option A)

Make `mpFetch` require an explicit `accessToken`; have `devices`/`orders`/`checkout.getPayment` forward it; update the request-path routes to resolve the token from the current tenant. The webhook temporarily passes the env token via `getAccessToken()` (Task 7 makes it tenant-aware). After this task the build + all tests are green.

**Files:**
- Modify: `src/lib/mercadopago/client.ts`
- Modify: `src/lib/mercadopago/devices.ts`, `src/lib/mercadopago/orders.ts`, `src/lib/mercadopago/checkout.ts`
- Modify tests: `src/lib/mercadopago/orders.test.ts`
- Modify routes: `src/app/api/terminals/sync/route.ts`, `src/app/api/checkout/terminal-charge/route.ts`, `src/app/api/checkout/terminal-charge/[id]/route.ts`, `src/app/api/checkout/terminal-charge/[id]/cancel/route.ts`
- Modify webhook (temporary env token): `src/app/api/webhooks/mercadopago/route.ts`

- [ ] **Step 1: Update `orders.test.ts` to pass a token (failing first)**

Replace each MP call in `src/lib/mercadopago/orders.test.ts` so the function receives a token, and assert `mpFetch` got it via `init.accessToken`:

```ts
// createTerminalOrder test — add accessToken to input and assert it reaches mpFetch
const res = await createTerminalOrder({
  terminalDeviceId: "DEV123", amount: 99.9, method: "CREDIT",
  installments: 3, externalRef: "chg_1", accessToken: "AT",
});
// ...existing body assertions unchanged...
expect(init.accessToken).toBe("AT");

// getOrder / cancelOrder now take a token
await getOrder("ord_1", "AT");
expect(mpFetchMock.mock.calls[0][1]?.accessToken).toBe("AT");
await cancelOrder("ord_1", "AT");
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/mercadopago/orders.test.ts`
Expected: FAIL (type/argument errors — functions don't accept a token yet).

- [ ] **Step 3: Refactor `client.ts` to require `accessToken`**

```ts
// src/lib/mercadopago/client.ts
export const MP_BASE_URL = "https://api.mercadopago.com";

/** Env token — used ONLY as the interim fallback inside resolveMpAccessToken and the webhook (pre-Task 7). */
export function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured");
  return token;
}

export class MpApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Mercado Pago API ${status}: ${body}`);
    this.name = "MpApiError";
  }
}

export async function mpFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string; accessToken: string }
): Promise<unknown> {
  const { idempotencyKey, accessToken, headers, ...rest } = init;
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...headers,
    },
  });
  if (!res.ok) throw new MpApiError(res.status, await res.text());
  return res.json();
}
```

- [ ] **Step 4: Forward the token in `devices.ts`**

```ts
// src/lib/mercadopago/devices.ts
import { mpFetch } from "./client";

export interface MpDevice {
  id: string;
  operating_mode?: string;
}

export async function listDevices(accessToken: string): Promise<MpDevice[]> {
  const res = (await mpFetch("/point/integration-api/devices", { accessToken })) as {
    devices?: MpDevice[];
  };
  return res.devices ?? [];
}

export async function setOperatingMode(
  deviceId: string,
  mode: "PDV" | "STANDALONE",
  accessToken: string
): Promise<void> {
  await mpFetch(`/point/integration-api/devices/${deviceId}`, {
    method: "PATCH",
    body: JSON.stringify({ operating_mode: mode }),
    accessToken,
  });
}
```

- [ ] **Step 5: Forward the token in `orders.ts`**

Add `accessToken` to `CreateTerminalOrderInput`, and a trailing `accessToken` param to `getOrder`/`cancelOrder`:

```ts
// src/lib/mercadopago/orders.ts — interface + the three calls (rest of file unchanged)
export interface CreateTerminalOrderInput {
  terminalDeviceId: string;
  amount: number;
  method: TerminalChargeMethod;
  installments: number;
  externalRef: string;
  accessToken: string;
}

export async function createTerminalOrder(input: CreateTerminalOrderInput): Promise<MpOrder> {
  const amount = toAmountString(input.amount);
  const body = {
    type: "point",
    external_reference: input.externalRef,
    total_amount: amount,
    config: { point: { terminal_id: input.terminalDeviceId, print_on_terminal: true } },
    transactions: {
      payments: [
        {
          amount,
          payment_method: {
            type: methodToMpType(input.method),
            ...(input.method === "CREDIT" ? { installments: input.installments } : {}),
          },
        },
      ],
    },
  };
  return (await mpFetch("/v1/orders", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: input.externalRef,
    accessToken: input.accessToken,
  })) as MpOrder;
}

export async function getOrder(orderId: string, accessToken: string): Promise<MpOrder> {
  return (await mpFetch(`/v1/orders/${orderId}`, { accessToken })) as MpOrder;
}

export async function cancelOrder(orderId: string, accessToken: string): Promise<MpOrder> {
  return (await mpFetch(`/v1/orders/${orderId}/cancel`, { method: "POST", accessToken })) as MpOrder;
}
```

- [ ] **Step 6: Forward the token in `checkout.getPayment`**

```ts
// src/lib/mercadopago/checkout.ts — change getPayment only (validateWebhookSignature stays; drop its local getAccessToken if now unused)
export async function getPayment(paymentId: string, accessToken: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mercado Pago API ${res.status}: ${body}`);
  }
  return res.json() as Promise<{ id: number; status: string; external_reference: string }>;
}
```

> Note: keep `validateWebhookSignature` and its `createHmac` import. Remove the now-unused local `getAccessToken()`/`MP_BASE_URL` in `checkout.ts` only if nothing else references them (run `npm run build` to confirm).

- [ ] **Step 7: Resolve + pass the token in `terminals/sync/route.ts`**

```ts
// src/app/api/terminals/sync/route.ts — resolve once, pass into both MP calls
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant/context";
import { listDevices, setOperatingMode } from "@/lib/mercadopago/devices";
import { resolveMpAccessToken } from "@/lib/mercadopago/connection";
import { mapMpErrorToOperatorMessage } from "@/lib/mercadopago/errors";

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  try {
    const tenantId = getTenantId();
    const accessToken = await resolveMpAccessToken(tenantId);
    const devices = await listDevices(accessToken);
    for (const device of devices) {
      await setOperatingMode(device.id, "PDV", accessToken).catch(() => {});
      await prisma.paymentTerminal.upsert({
        where: { tenant_id_mp_device_id: { tenant_id: tenantId, mp_device_id: device.id } },
        update: { operating_mode: "PDV", last_seen_at: new Date(), status: "ONLINE" },
        create: { name: device.id, mp_device_id: device.id, operating_mode: "PDV", status: "ONLINE" },
      });
    }
    const terminals = await prisma.paymentTerminal.findMany({ orderBy: { created_at: "asc" } });
    return NextResponse.json({ synced: devices.length, terminals });
  } catch (err) {
    const op = mapMpErrorToOperatorMessage(err);
    return NextResponse.json({ error: op.message, code: op.code }, { status: 502 });
  }
}
```

- [ ] **Step 8: Resolve + pass the token in the terminal-charge routes**

In `src/app/api/checkout/terminal-charge/route.ts`, add the import and resolve before `createTerminalOrder`, then pass it:

```ts
import { getTenantId } from "@/lib/tenant/context";
import { resolveMpAccessToken } from "@/lib/mercadopago/connection";
// ...inside POST, just before the try { const order = await createTerminalOrder(...) }:
  const accessToken = await resolveMpAccessToken(getTenantId());
  try {
    const order = await createTerminalOrder({
      terminalDeviceId: terminal.mp_device_id,
      amount: totalAmount,
      method,
      installments,
      externalRef: charge.id,
      accessToken,
    });
```

In `src/app/api/checkout/terminal-charge/[id]/route.ts` (status — calls `getOrder`) and `.../[id]/cancel/route.ts` (calls `cancelOrder`), resolve the token at the top of the handler and pass it:

```ts
import { getTenantId } from "@/lib/tenant/context";
import { resolveMpAccessToken } from "@/lib/mercadopago/connection";
// ...
const accessToken = await resolveMpAccessToken(getTenantId());
const order = await getOrder(charge.mp_order_id, accessToken);   // status route
// const order = await cancelOrder(charge.mp_order_id, accessToken); // cancel route
```

> If either `[id]` route doesn't already bind tenant context, call `await requireTenant()` (from `@/lib/auth`) first and return 401 if null — mirrors the auth pattern. Confirm by reading the file before editing.

- [ ] **Step 9: Keep the webhook compiling (temporary env token)**

In `src/app/api/webhooks/mercadopago/route.ts`, import `getAccessToken` and pass it to the two MP calls (replaced in Task 7):

```ts
import { getAccessToken } from "@/lib/mercadopago/client";
// ...
const order = await getOrder(orderId, getAccessToken());        // Orders topic — TODO Task 7: tenant token
// ...
const payment = await getPayment(paymentId, getAccessToken());  // payment topic — TODO Task 7: tenant token
```

- [ ] **Step 10: Run the affected tests + full build**

Run: `npm test -- src/lib/mercadopago/orders.test.ts`
Expected: PASS.
Run: `npm test`
Expected: PASS (all suites — fix any other test that called these functions without a token).
Run: `npm run build`
Expected: succeeds (no type errors across routes).

- [ ] **Step 11: Commit**

```bash
git add src/lib/mercadopago src/app/api/terminals src/app/api/checkout src/app/api/webhooks
git commit -m "refactor: thread per-tenant MP access token through all MP calls (Option A)"
```

---

## Task 6: OAuth routes — start + callback

**Files:**
- Create: `src/lib/mercadopago/pkceCookie.ts` (cookie name + options)
- Create: `src/app/api/mp/oauth/start/route.ts`
- Create: `src/app/api/mp/oauth/callback/route.ts`
- Test: `src/app/api/mp/oauth/callback/route.test.ts`

- [ ] **Step 1: Write the failing callback test**

```ts
// src/app/api/mp/oauth/callback/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mercadopago/oauthState", () => ({ verifyState: vi.fn() }));
vi.mock("@/lib/mercadopago/oauth", () => ({ exchangeCodeForTokens: vi.fn() }));
vi.mock("@/lib/mercadopago/connection", () => ({ saveConnection: vi.fn() }));

import { GET } from "./route";
import { verifyState } from "@/lib/mercadopago/oauthState";
import { exchangeCodeForTokens } from "@/lib/mercadopago/oauth";
import { saveConnection } from "@/lib/mercadopago/connection";

const verifyMock = verifyState as unknown as ReturnType<typeof vi.fn>;
const exchangeMock = exchangeCodeForTokens as unknown as ReturnType<typeof vi.fn>;
const saveMock = saveConnection as unknown as ReturnType<typeof vi.fn>;

function req(url: string, pkce = "VER") {
  return new Request(url, { headers: { cookie: `mp_pkce=${pkce}` } });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/mp/oauth/callback", () => {
  it("exchanges the code and saves the connection, then redirects to settings (success)", async () => {
    verifyMock.mockReturnValue({ tenantId: "t1" });
    exchangeMock.mockResolvedValue({ accessToken: "AT", refreshToken: "RT", mpUserId: "555", expiresInSeconds: 100, liveMode: true });
    const res = await GET(req("https://app.example.com/api/mp/oauth/callback?code=CODE&state=STATE"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/settings/terminals?mp=connected");
    expect(exchangeMock).toHaveBeenCalledWith({ code: "CODE", codeVerifier: "VER" });
    expect(saveMock).toHaveBeenCalledWith("t1", expect.objectContaining({ accessToken: "AT" }));
  });

  it("redirects with an error when MP returns error=access_denied", async () => {
    const res = await GET(req("https://app.example.com/api/mp/oauth/callback?error=access_denied"));
    expect(res.headers.get("location")).toContain("/settings/terminals?mp=error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("redirects with an error when state verification fails", async () => {
    verifyMock.mockImplementation(() => { throw new Error("Invalid state signature"); });
    const res = await GET(req("https://app.example.com/api/mp/oauth/callback?code=CODE&state=BAD"));
    expect(res.headers.get("location")).toContain("/settings/terminals?mp=error");
    expect(saveMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/app/api/mp/oauth/callback/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Add the PKCE cookie helper**

```ts
// src/lib/mercadopago/pkceCookie.ts
export const PKCE_COOKIE = "mp_pkce";

export const pkceCookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/mp/oauth",
  maxAge: 600, // 10 min, matches state TTL
};
```

- [ ] **Step 4: Implement the start route**

```ts
// src/app/api/mp/oauth/start/route.ts
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
```

- [ ] **Step 5: Implement the callback route**

```ts
// src/app/api/mp/oauth/callback/route.ts
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
```

- [ ] **Step 6: Run the test + build**

Run: `npm test -- src/app/api/mp/oauth/callback/route.test.ts`
Expected: PASS (3 tests).
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mercadopago/pkceCookie.ts src/app/api/mp/oauth
git commit -m "feat: MP OAuth start + callback routes (PKCE, signed state)"
```

---

## Task 7: Webhook → tenant routing

Map MP's collector `user_id → tenant`, resolve that tenant's token, and reconcile inside `runWithTenant`. Replaces the temporary env token from Task 5 and the `TODO` in `finalize.ts`.

**Files:**
- Modify: `src/app/api/webhooks/mercadopago/route.ts`
- Create: `src/lib/mercadopago/webhookTenant.ts` (map `user_id → tenantId`)
- Test: `src/lib/mercadopago/webhookTenant.test.ts`

- [ ] **Step 1: Write the failing mapper test**

```ts
// src/lib/mercadopago/webhookTenant.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  basePrisma: { mpConnection: { findFirst: vi.fn() } },
}));

import { basePrisma } from "@/lib/prisma";
import { resolveTenantFromUserId } from "./webhookTenant";

const findFirst = basePrisma.mpConnection.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("resolveTenantFromUserId", () => {
  it("returns the tenant_id mapped from mp_user_id", async () => {
    findFirst.mockResolvedValue({ tenant_id: "t1" });
    expect(await resolveTenantFromUserId("555")).toBe("t1");
    expect(findFirst).toHaveBeenCalledWith({ where: { mp_user_id: "555" } });
  });

  it("returns null when no connection matches", async () => {
    findFirst.mockResolvedValue(null);
    expect(await resolveTenantFromUserId("999")).toBeNull();
  });

  it("returns null for an empty user id", async () => {
    expect(await resolveTenantFromUserId("")).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/mercadopago/webhookTenant.test.ts`
Expected: FAIL — cannot find module `./webhookTenant`.

- [ ] **Step 3: Implement the mapper**

```ts
// src/lib/mercadopago/webhookTenant.ts
import { basePrisma } from "@/lib/prisma";

/** Map MP's collector user_id (from the webhook payload) to our tenant. */
export async function resolveTenantFromUserId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const conn = await basePrisma.mpConnection.findFirst({ where: { mp_user_id: userId } });
  return conn?.tenant_id ?? null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/mercadopago/webhookTenant.test.ts`
Expected: PASS.

- [ ] **Step 5: Make the webhook tenant-aware**

Edit `src/app/api/webhooks/mercadopago/route.ts`: after signature validation, resolve the tenant from `body.user_id`, resolve that tenant's token, and run the topic handling inside `runWithTenant`. Fall back to Tenant #1 / env token when unmapped (logged). Replace the Task-5 `getAccessToken()` calls.

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPayment, validateWebhookSignature } from "@/lib/mercadopago/checkout";
import { getOrder } from "@/lib/mercadopago/orders";
import { finalizeCharge } from "@/lib/mercadopago/finalize";
import { resolveTenantFromUserId } from "@/lib/mercadopago/webhookTenant";
import { resolveMpAccessToken } from "@/lib/mercadopago/connection";
import { runWithTenant } from "@/lib/tenant/context";

const FALLBACK_TENANT_ID = process.env.MP_FALLBACK_TENANT_ID ?? "";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    if (!xSignature || !xRequestId) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }
    if (!validateWebhookSignature(xSignature, xRequestId, String(body.data?.id))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Resolve the tenant that owns this MP resource (Connect: collector user_id).
    const userId = String(body.user_id ?? "");
    const tenantId = (await resolveTenantFromUserId(userId)) ?? FALLBACK_TENANT_ID;
    if (!tenantId) {
      console.warn(`[mp-webhook] no tenant for user_id=${userId}; ignoring`);
      return NextResponse.json({ received: true, ignored: "no_tenant" });
    }

    return await runWithTenant(tenantId, async () => {
      const accessToken = await resolveMpAccessToken(tenantId);
      const topic = body.type ?? body.topic;

      if (topic === "order") {
        const orderId = String(body.data?.id ?? body.id);
        if (!orderId || orderId === "undefined") {
          return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
        }
        const order = await getOrder(orderId, accessToken);
        const payment = order.transactions?.payments?.[0];
        if (order.status && payment?.id) {
          await finalizeCharge(orderId, { status: payment.status ?? order.status, paymentId: payment.id });
        }
        return NextResponse.json({ received: true, order: orderId });
      }

      if (body.type !== "payment") {
        return NextResponse.json({ received: true });
      }

      const paymentId = String(body.data?.id);
      if (!paymentId || paymentId === "undefined") {
        return NextResponse.json({ error: "Missing payment ID" }, { status: 400 });
      }
      const payment = await getPayment(paymentId, accessToken);
      if (payment.status !== "approved") {
        return NextResponse.json({ received: true, status: payment.status });
      }

      const saleId = payment.external_reference;
      if (!saleId) {
        return NextResponse.json({ error: "Missing external_reference in payment" }, { status: 400 });
      }
      const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
      if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
      if (sale.status === "APPROVED") return NextResponse.json({ received: true, already_processed: true });

      const stockOps = sale.items.map((item) =>
        item.variant_id
          ? prisma.productVariant.update({ where: { id: item.variant_id }, data: { stock_quantity: { decrement: item.quantity } } })
          : prisma.product.update({ where: { id: item.product_id }, data: { stock_quantity: { decrement: item.quantity } } })
      );
      await prisma.$transaction([
        prisma.sale.update({ where: { id: saleId }, data: { status: "APPROVED" } }),
        ...stockOps,
      ]);
      return NextResponse.json({ received: true, sale_approved: true });
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

> `prisma` (the scoped client) now runs inside `runWithTenant`, so the payment-topic stock updates have a tenant context — previously they would have thrown. `MP_FALLBACK_TENANT_ID` should be set to Tenant #1's id (`cmqtu2mxn000085ddpkmct6aq`) in env so unmapped/legacy webhooks keep working during the single-tenant interim.

- [ ] **Step 6: Update `finalize.ts` comment**

In `src/lib/mercadopago/finalize.ts`, replace the `TODO: make webhook fully tenant-aware…` comment with: `// Called inside runWithTenant() from the webhook; basePrisma lookup by globally-unique mp_order_id is intentional.`

- [ ] **Step 7: Run tests + build**

Run: `npm test`
Expected: PASS (update `src/app/api/webhooks/mercadopago/route.test.ts` if it asserts old behavior — add `user_id` to the test payloads and a mocked `mpConnection.findFirst`/`resolveMpAccessToken`).
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/mercadopago/webhookTenant.ts src/lib/mercadopago/webhookTenant.test.ts src/app/api/webhooks/mercadopago src/lib/mercadopago/finalize.ts
git commit -m "feat: tenant-aware MP webhook (map user_id -> tenant, reconcile in context)"
```

---

## Task 8: Distinct "not connected" operator message

Surface `MpNotConnectedError` as a clear "connect your account" message instead of the misleading "Maquininha sem conexão".

**Files:**
- Modify: `src/lib/mercadopago/errors.ts`
- Modify: `src/lib/mercadopago/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to src/lib/mercadopago/errors.test.ts
import { MpNotConnectedError } from "./connection";
// ...
it("maps MpNotConnectedError to a connect-account message", () => {
  const op = mapMpErrorToOperatorMessage(new MpNotConnectedError("t1"));
  expect(op.code).toBe("NOT_CONNECTED");
  expect(op.message).toMatch(/conecte.*mercado pago/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/mercadopago/errors.test.ts`
Expected: FAIL — `NOT_CONNECTED` not produced.

- [ ] **Step 3: Implement**

```ts
// src/lib/mercadopago/errors.ts
import { MpApiError } from "./client";
import { MpNotConnectedError } from "./connection";

export type OperatorError = {
  code: "DEVICE_BUSY" | "OFFLINE" | "DECLINED" | "CONFIG" | "NOT_CONNECTED" | "GENERIC";
  message: string;
};

export function mapMpErrorToOperatorMessage(err: unknown): OperatorError {
  if (err instanceof MpNotConnectedError) {
    return { code: "NOT_CONNECTED", message: "Conecte sua conta Mercado Pago em Configurações para usar a maquininha." };
  }
  if (err instanceof MpApiError) {
    if (err.status === 409)
      return { code: "DEVICE_BUSY", message: "Maquininha ocupada — cancele a cobrança anterior." };
    if (err.status === 403)
      return { code: "CONFIG", message: "Configuração do Mercado Pago inválida. Verifique o app/integração." };
    if (err.status === 400)
      return { code: "GENERIC", message: "Dados da cobrança inválidos." };
    return { code: "GENERIC", message: "Erro ao comunicar com a maquininha. Tente novamente." };
  }
  return { code: "OFFLINE", message: "Maquininha sem conexão. Verifique a internet do dispositivo." };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/mercadopago/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mercadopago/errors.ts src/lib/mercadopago/errors.test.ts
git commit -m "feat: distinct operator message for MP-not-connected"
```

---

## Task 9: Settings UI — connect / status / disconnect

**Files:**
- Create: `src/app/api/mp/connection/route.ts` (GET status, DELETE disconnect)
- Test: `src/app/api/mp/connection/route.test.ts`
- Create: `src/components/settings/MpConnectCard.tsx`
- Modify: `src/app/settings/terminals/page.tsx` (render `MpConnectCard`)

- [ ] **Step 1: Write the failing status/disconnect test**

```ts
// src/app/api/mp/connection/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireTenant: vi.fn() }));
vi.mock("@/lib/mercadopago/connection", () => ({ getConnectionStatus: vi.fn(), deleteConnection: vi.fn() }));

import { GET, DELETE } from "./route";
import { requireTenant } from "@/lib/auth";
import { getConnectionStatus, deleteConnection } from "@/lib/mercadopago/connection";

const requireTenantMock = requireTenant as unknown as ReturnType<typeof vi.fn>;
const statusMock = getConnectionStatus as unknown as ReturnType<typeof vi.fn>;
const deleteMock = deleteConnection as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/mp/connection", () => {
  it("401 when unauthenticated", async () => {
    requireTenantMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("returns the connection status for the tenant", async () => {
    requireTenantMock.mockResolvedValue({ tenantId: "t1" });
    statusMock.mockResolvedValue({ connected: true, mpUserId: "555", liveMode: true });
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: true, mpUserId: "555", liveMode: true });
    expect(statusMock).toHaveBeenCalledWith("t1");
  });
});

describe("DELETE /api/mp/connection", () => {
  it("disconnects the tenant", async () => {
    requireTenantMock.mockResolvedValue({ tenantId: "t1" });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("t1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/app/api/mp/connection/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Implement the connection status/disconnect route**

```ts
// src/app/api/mp/connection/route.ts
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { getConnectionStatus, deleteConnection } from "@/lib/mercadopago/connection";

export async function GET() {
  const tenant = await requireTenant();
  if (!tenant) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  return NextResponse.json(await getConnectionStatus(tenant.tenantId));
}

export async function DELETE() {
  const tenant = await requireTenant();
  if (!tenant) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  await deleteConnection(tenant.tenantId);
  return NextResponse.json({ disconnected: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/app/api/mp/connection/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the client card**

```tsx
// src/components/settings/MpConnectCard.tsx
"use client";

import { useEffect, useState } from "react";

type Status = { connected: boolean; mpUserId?: string; liveMode?: boolean };

export function MpConnectCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/mp/connection").then((r) => r.json()).then(setStatus).catch(() => setStatus({ connected: false }));
  }, []);

  async function disconnect() {
    setBusy(true);
    await fetch("/api/mp/connection", { method: "DELETE" });
    setStatus({ connected: false });
    setBusy(false);
  }

  return (
    <section aria-labelledby="mp-connect-heading" className="rounded-lg border p-4">
      <h2 id="mp-connect-heading" className="text-lg font-semibold">Mercado Pago</h2>
      {status === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : status.connected ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm">
            Conectado{status.mpUserId ? ` (conta ${status.mpUserId})` : ""}
            {status.liveMode === false ? " — modo teste" : ""}.
          </p>
          <button onClick={disconnect} disabled={busy}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            {busy ? "Desconectando…" : "Desconectar"}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            Conecte sua conta Mercado Pago para usar sua própria maquininha.
          </p>
          <a href="/api/mp/oauth/start"
            className="inline-block rounded-md bg-[#009ee3] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
            Conectar Mercado Pago
          </a>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Render the card in the terminals settings page**

In `src/app/settings/terminals/page.tsx`, import and render `MpConnectCard` near the top of the page content:

```tsx
import { MpConnectCard } from "@/components/settings/MpConnectCard";
// ...inside the page's returned layout, above the terminals list:
<MpConnectCard />
```

> Match the existing page's container/spacing classes — read the file first and place the card so it reads as part of the existing layout, not bolted on. Surface the `?mp=connected` / `?mp=error` query (set by the callback) as a small inline success/error banner if the page already has a notification pattern; otherwise the card's live status is sufficient.

- [ ] **Step 7: Run tests + build**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/mp/connection src/components/settings/MpConnectCard.tsx src/app/settings/terminals/page.tsx
git commit -m "feat: settings UI to connect/disconnect Mercado Pago + status endpoint"
```

---

## Task 10: Env documentation + full verification

**Files:**
- Modify: `.env.example` (create if absent)

- [ ] **Step 1: Document the new env vars**

Add to `.env.example` (do NOT add real values):

```bash
# Mercado Pago OAuth / Connect (per-tenant)
MP_OAUTH_CLIENT_ID=
MP_OAUTH_CLIENT_SECRET=
MP_OAUTH_REDIRECT_URI=http://localhost:3000/api/mp/oauth/callback
MP_OAUTH_STATE_SECRET=
# 32-byte hex (e.g. `openssl rand -hex 32`)
MP_TOKEN_ENC_KEY=
# Tenant #1 id — fallback for unmapped/legacy webhooks during the single-tenant interim
MP_FALLBACK_TENANT_ID=
# Reused as the interim per-tenant fallback until every tenant connects
MERCADOPAGO_ACCESS_TOKEN=
```

- [ ] **Step 2: Full verification**

Run: `npm test`
Expected: PASS (all suites).
Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: document MP Connect env vars in .env.example"
```

- [ ] **Step 4: Final review checklist (no code — confirm before finishing)**

- [ ] `mpFetch` no longer reads `process.env` directly; every MP call receives an explicit token.
- [ ] No tenant can read/write another tenant's `MpConnection` (lookups keyed by `tenant_id` from session).
- [ ] Tokens are never logged; stored only as `secretBox` ciphertext.
- [ ] Webhook reconciliation runs inside `runWithTenant`; scoped `prisma` calls have a context.
- [ ] Env-token fallback keeps Tenant #1 working with zero behavior change until it connects.
- [ ] No Prisma schema change; no `db push`.

---

## Deferred to rollout (NOT in this plan — needs Andre's go-ahead)

1. Add the new env vars in Vercel (incl. `MP_TOKEN_ENC_KEY`, `MP_FALLBACK_TENANT_ID=cmqtu2mxn000085ddpkmct6aq`).
2. Confirm MP application has OAuth/Connect + Point integrator enabled (resolves the live 403); connect Tenant #1 and verify a live charge.
3. Later cleanup: remove the env-token fallback once all tenants are connected.
