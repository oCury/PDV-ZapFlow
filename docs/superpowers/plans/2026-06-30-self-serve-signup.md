# Self-Serve Trial Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a landing visitor self-register, verify their email (Resend magic link), and land in a fully-working 7-day trial account — with trial expiry gated behind an `/assinar` paywall.

**Architecture:** Verify-first signup: `POST /api/auth/signup` stores a `PendingSignup` (no tenant yet) and emails a magic link; `POST /api/auth/verify` creates the Tenant (plan + `trial_ends_at = now+7d`) + admin User via a shared provision service, then sets the session cookie. The fixed `trialEndsAt` rides in the signed cookie so the existing **middleware** gates expired trials at the edge (no DB). Payment/auto-charge is explicitly out (→ C1 billing).

**Tech Stack:** Next.js 15 (App Router), Prisma 6 + Postgres (Supabase), TypeScript, Vitest, Resend.

**Spec:** `docs/superpowers/specs/2026-06-30-self-serve-signup-design.md`
**Branch:** `feat/self-serve-signup` (off `main`)
**Run:** `npm test` (vitest), `npx tsc --noEmit`, `npm run build`.

**Reused existing code (read before starting):**
- `src/lib/auth.ts`: `hashPassword(pw): string`, `createSessionToken(data): string`, `setSessionCookie(data): Promise<void>`, `getSession()`, exported `SESSION_COOKIE`, and `interface SessionPayload { userId; role: "ADMIN"|"EMPLOYEE"; name; tenantId }`.
- `src/lib/prisma.ts`: `basePrisma` (unscoped — REQUIRED for signup/verify, which run before a tenant context exists).
- `src/lib/entitlements.ts`: `PLANS`, type `Plan`.
- `scripts/create-tenant.ts`: current provisioning logic to extract.
- `src/middleware.ts`: edge auth/redirect; `src/lib/auth-edge.ts`: `getSessionFromRequest(req)`.

---

## Task 0: Branch

- [ ] **Step 1: Create branch**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow checkout main && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow checkout -b feat/self-serve-signup
```

---

## Task 1: Pure helpers — `src/lib/signup.ts`

**Files:** Create `src/lib/signup.ts`; Test `src/lib/signup.test.ts`.

- [ ] **Step 1: Write the failing test**
```ts
// src/lib/signup.test.ts
import { describe, it, expect } from "vitest";
import { slugify, validateSignup, trialStatus, TRIAL_DAYS } from "./signup";

describe("slugify", () => {
  it("lowercases, strips accents/symbols, hyphenates", () => {
    expect(slugify("Loja do João & Cia!")).toBe("loja-do-joao-cia");
  });
  it("collapses and trims hyphens", () => {
    expect(slugify("  --A  B--  ")).toBe("a-b");
  });
  it("falls back to 'loja' when empty after sanitisation", () => {
    expect(slugify("!!!")).toBe("loja");
  });
});

describe("validateSignup", () => {
  const ok = { loja: "Loja X", name: "Ana", email: "a@b.com", password: "secret12", plan: "pro", website: "" };
  it("accepts a valid payload", () => {
    expect(validateSignup(ok)).toEqual({ ok: true });
  });
  it("rejects honeypot filled", () => {
    expect(validateSignup({ ...ok, website: "bot" })).toEqual({ ok: false, error: "Cadastro inválido." });
  });
  it("rejects short password", () => {
    expect(validateSignup({ ...ok, password: "short" }).ok).toBe(false);
  });
  it("rejects bad email", () => {
    expect(validateSignup({ ...ok, email: "nope" }).ok).toBe(false);
  });
  it("rejects unknown plan", () => {
    expect(validateSignup({ ...ok, plan: "enterprise" }).ok).toBe(false);
  });
  it("rejects missing loja/name", () => {
    expect(validateSignup({ ...ok, loja: "" }).ok).toBe(false);
  });
});

describe("trialStatus", () => {
  const now = new Date("2026-06-30T12:00:00Z");
  it("null trial_ends_at => active (grandfathered)", () => {
    expect(trialStatus(null, now)).toEqual({ state: "active", daysLeft: null });
  });
  it("future => trialing with daysLeft (ceil)", () => {
    expect(trialStatus(new Date("2026-07-02T12:00:00Z"), now)).toEqual({ state: "trialing", daysLeft: 2 });
  });
  it("past => expired", () => {
    expect(trialStatus(new Date("2026-06-29T12:00:00Z"), now)).toEqual({ state: "expired", daysLeft: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `npm test -- src/lib/signup.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**
```ts
// src/lib/signup.ts
import { type Plan } from "@/lib/entitlements";

export const TRIAL_DAYS = 7;
export const SIGNUP_PLANS: Plan[] = ["basic", "pro"]; // enterprise is sales-led
const PASSWORD_MIN = 8;

export function slugify(input: string): string {
  const s = input
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "loja";
}

export interface SignupInput {
  loja: string; name: string; email: string; password: string; plan: string; website?: string;
}
export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateSignup(i: SignupInput): ValidationResult {
  if (i.website) return { ok: false, error: "Cadastro inválido." }; // honeypot
  if (!i.loja?.trim() || !i.name?.trim()) return { ok: false, error: "Informe o nome da loja e o seu nome." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email ?? "")) return { ok: false, error: "E-mail inválido." };
  if ((i.password ?? "").length < PASSWORD_MIN) return { ok: false, error: `Senha precisa de ao menos ${PASSWORD_MIN} caracteres.` };
  if (!(SIGNUP_PLANS as string[]).includes(i.plan)) return { ok: false, error: "Plano inválido." };
  return { ok: true };
}

export type TrialState = "active" | "trialing" | "expired";
export function trialStatus(trialEndsAt: Date | null, now: Date = new Date()): { state: TrialState; daysLeft: number | null } {
  if (!trialEndsAt) return { state: "active", daysLeft: null };
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms <= 0) return { state: "expired", daysLeft: 0 };
  return { state: "trialing", daysLeft: Math.ceil(ms / 86_400_000) };
}
```
Note: the accent-stripping regex targets the combining-diacritics range. `SIGNUP_PLANS` intentionally excludes enterprise.

- [ ] **Step 4: Run — expect PASS**
Run: `npm test -- src/lib/signup.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/signup.ts src/lib/signup.test.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): pure helpers (slugify, validateSignup, trialStatus)"
```

---

## Task 2: Prisma — `PendingSignup` + `Tenant.trial_ends_at`

**Files:** Modify `prisma/schema.prisma`. (No `db push` here — rollout = Task 13.)

- [ ] **Step 1: Add the model + column**
Add near other models:
```prisma
model PendingSignup {
  id            String   @id @default(cuid())
  token         String   @unique
  email         String   @unique
  name          String
  loja          String
  password_hash String
  plan          Plan
  expires_at    DateTime
  created_at    DateTime @default(now())

  @@map("pending_signups")
}
```
In `model Tenant { ... }` add:
```prisma
  trial_ends_at DateTime?
```

- [ ] **Step 2: Generate client**
Run: `cd /Users/andrecury/Projetos/PDV/PDV-ZapFlow && npx prisma generate` → "Generated Prisma Client".

- [ ] **Step 3: Type-check**
Run: `npx tsc --noEmit` → no new errors.

- [ ] **Step 4: Commit**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add prisma/schema.prisma && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): PendingSignup model + Tenant.trial_ends_at"
```

---

## Task 3: Provision service — `src/lib/tenant/provision.ts`

**Files:** Create `src/lib/tenant/provision.ts`; Modify `scripts/create-tenant.ts` to use it; Test `src/lib/tenant/provision.test.ts`.

- [ ] **Step 1: Write the failing test (slug uniqueness logic, DB mocked)**
```ts
// src/lib/tenant/provision.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const findFirst = vi.fn();
const txCreateTenant = vi.fn();
const txCreateUser = vi.fn();
vi.mock("@/lib/prisma", () => ({
  basePrisma: {
    tenant: { findFirst: (a: unknown) => findFirst(a) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      tenant: { create: (a: unknown) => txCreateTenant(a) },
      user: { create: (a: unknown) => txCreateUser(a) },
    }),
  },
}));
import { uniqueSlug, createTenantWithAdmin } from "./provision";

beforeEach(() => { findFirst.mockReset(); txCreateTenant.mockReset(); txCreateUser.mockReset(); });

describe("uniqueSlug", () => {
  it("returns base when free", async () => {
    findFirst.mockResolvedValue(null);
    expect(await uniqueSlug("loja-x")).toBe("loja-x");
  });
  it("appends -2, -3 until free", async () => {
    findFirst.mockResolvedValueOnce({ id: "1" }).mockResolvedValueOnce({ id: "2" }).mockResolvedValueOnce(null);
    expect(await uniqueSlug("loja-x")).toBe("loja-x-3");
  });
});

describe("createTenantWithAdmin", () => {
  it("creates tenant then admin in a transaction with the given fields", async () => {
    findFirst.mockResolvedValue(null);
    txCreateTenant.mockResolvedValue({ id: "t1", slug: "loja-x", plan: "pro" });
    txCreateUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    const trial = new Date("2026-07-07T00:00:00Z");
    const res = await createTenantWithAdmin({ name: "Loja X", slugBase: "loja-x", email: "a@b.com", passwordHash: "h", plan: "pro", trialEndsAt: trial });
    expect(txCreateTenant).toHaveBeenCalledWith({ data: { name: "Loja X", slug: "loja-x", plan: "pro", trial_ends_at: trial } });
    expect(txCreateUser).toHaveBeenCalledWith({ data: { name: "Administrador", email: "a@b.com", password: "h", role: "ADMIN", tenant_id: "t1" } });
    expect(res).toEqual({ tenantId: "t1", slug: "loja-x", userId: "u1" });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
Run: `npm test -- src/lib/tenant/provision.test.ts` → FAIL.

- [ ] **Step 3: Implement**
```ts
// src/lib/tenant/provision.ts
import { basePrisma } from "@/lib/prisma";
import type { Plan } from "@/lib/entitlements";

/** Find a free slug, appending -2, -3, ... on collision. Uses basePrisma (unscoped). */
export async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; ; n++) {
    const hit = await basePrisma.tenant.findFirst({ where: { slug: candidate }, select: { id: true } });
    if (!hit) return candidate;
    candidate = `${base}-${n}`;
  }
}

export interface ProvisionInput {
  name: string; slugBase: string; email: string; passwordHash: string; plan: Plan; trialEndsAt: Date | null;
}

/** Atomically create a tenant + its admin user. Returns ids. Caller pre-hashes the password. */
export async function createTenantWithAdmin(i: ProvisionInput): Promise<{ tenantId: string; slug: string; userId: string }> {
  const slug = await uniqueSlug(i.slugBase);
  return basePrisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: i.name, slug, plan: i.plan, trial_ends_at: i.trialEndsAt } });
    const user = await tx.user.create({ data: { name: "Administrador", email: i.email, password: i.passwordHash, role: "ADMIN", tenant_id: tenant.id } });
    return { tenantId: tenant.id, slug: tenant.slug, userId: user.id };
  });
}
```

- [ ] **Step 4: Run — expect PASS**
Run: `npm test -- src/lib/tenant/provision.test.ts` → PASS.

- [ ] **Step 5: Refactor `scripts/create-tenant.ts` to use it**
Read the script. Replace its inline `prisma.tenant.create` + `prisma.user.create` with:
```ts
import { createTenantWithAdmin } from "../src/lib/tenant/provision";
import { hashPassword } from "../src/lib/auth";
// ...after arg parsing + plan validation:
const res = await createTenantWithAdmin({ name, slugBase: slug, email, passwordHash: hashPassword(password), plan, trialEndsAt: null });
console.log(`Tenant ${res.slug} (${res.tenantId})`);
console.log(`Admin ${email} (${res.userId})`);
```
(`trialEndsAt: null` — CLI-created tenants are never trial-gated. Keep the existing `--plan` validation and clean `process.exit(0)`.)
Run `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/tenant/provision.ts src/lib/tenant/provision.test.ts scripts/create-tenant.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): shared tenant+admin provision service; CLI reuses it"
```

---

## Task 4: Email service — `src/lib/email/resend.ts`

**Files:** add `resend` dep; Create `src/lib/email/resend.ts`; Test `src/lib/email/resend.test.ts`.

- [ ] **Step 1: Add dependency**
Run: `cd /Users/andrecury/Projetos/PDV/PDV-ZapFlow && npm install resend`

- [ ] **Step 2: Write the failing test (Resend client mocked)**
```ts
// src/lib/email/resend.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send: (a: unknown) => send(a) }; } }));
beforeEach(() => { send.mockReset(); process.env.RESEND_API_KEY = "re_test"; process.env.EMAIL_FROM = "no-reply@zap.test"; });

import { sendVerificationEmail } from "./resend";

describe("sendVerificationEmail", () => {
  it("sends to the address with the link in the body and subject", async () => {
    send.mockResolvedValue({ data: { id: "e1" }, error: null });
    await sendVerificationEmail({ to: "a@b.com", name: "Ana", link: "https://app/verify?token=xyz" });
    const arg = send.mock.calls[0][0] as { from: string; to: string; subject: string; html: string };
    expect(arg.to).toBe("a@b.com");
    expect(arg.from).toBe("no-reply@zap.test");
    expect(arg.html).toContain("https://app/verify?token=xyz");
    expect(arg.subject).toMatch(/confirm/i);
  });
  it("throws when Resend returns an error", async () => {
    send.mockResolvedValue({ data: null, error: { message: "bad" } });
    await expect(sendVerificationEmail({ to: "a@b.com", name: "Ana", link: "x" })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Implement**
```ts
// src/lib/email/resend.ts
import { Resend } from "resend";

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required to send email.");
  return new Resend(key);
}

export async function sendVerificationEmail(p: { to: string; name: string; link: string }): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "no-reply@zapflow.app";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
      <h2>Confirme seu e-mail</h2>
      <p>Olá ${p.name}, falta um passo para ativar seu teste grátis no PDV ZapFlow.</p>
      <p><a href="${p.link}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar e-mail</a></p>
      <p style="color:#64748b;font-size:13px">O link expira em 24 horas. Se o botão não funcionar, copie e cole: <br>${p.link}</p>
    </div>`;
  const { error } = await client().emails.send({ from, to: p.to, subject: "Confirme seu e-mail — PDV ZapFlow", html });
  if (error) throw new Error(`Falha ao enviar e-mail: ${error.message ?? "desconhecido"}`);
}
```

- [ ] **Step 4: Run — expect PASS**
Run: `npm test -- src/lib/email/resend.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add package.json package-lock.json src/lib/email/resend.ts src/lib/email/resend.test.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): Resend verification email service"
```

---

## Task 5: Session cookie carries `trialEndsAt`

**Files:** Modify `src/lib/auth.ts`, `src/lib/auth-edge.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/me/route.ts`.

- [ ] **Step 1: Extend `SessionPayload` (auth.ts)**
In `src/lib/auth.ts`, change `interface SessionPayload` to add an optional field:
```ts
interface SessionPayload {
  userId: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  tenantId: string;
  trialEndsAt?: string | null; // ISO string; absent/null => no trial limit
}
```
(No other change needed — `createSessionToken`/`parseSessionToken` JSON-encode the whole payload, so the field rides along.)

- [ ] **Step 2: Login sets it (login route)**
Read `src/app/api/auth/login/route.ts`. It builds the session from the looked-up user (via `basePrisma`). After fetching the user, read the tenant's `trial_ends_at` (extend the existing query to include the tenant, or add `const tenant = await basePrisma.tenant.findUnique({ where: { id: user.tenant_id }, select: { trial_ends_at: true } })`). Add to the `createSessionToken`/`setSessionCookie` payload: `trialEndsAt: tenant?.trial_ends_at ? tenant.trial_ends_at.toISOString() : null`.

- [ ] **Step 3: Edge parser exposes it (auth-edge.ts)**
Read `src/lib/auth-edge.ts`. Its parsed payload is the same JSON, so `trialEndsAt` is already present at runtime — add `trialEndsAt?: string | null` to that file's payload interface so middleware can read it type-safely.

- [ ] **Step 4: `/api/auth/me` returns trial info**
In `src/app/api/auth/me/route.ts`, after the session check, add `trial` to the response:
```ts
import { trialStatus } from "@/lib/signup";
import { basePrisma } from "@/lib/prisma";
// ...inside GET, after `if (!session) ...`:
const tenant = await basePrisma.tenant.findUnique({ where: { id: session.tenantId }, select: { trial_ends_at: true } });
const trial = trialStatus(tenant?.trial_ends_at ?? null);
// include `trial` in the returned JSON alongside user/plan/entitlements
```

- [ ] **Step 5: Type-check**
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/auth.ts src/lib/auth-edge.ts src/app/api/auth/login/route.ts src/app/api/auth/me/route.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): carry trialEndsAt in session cookie + expose trial in /api/auth/me"
```

---

## Task 6: Signup endpoint — `POST /api/auth/signup`

**Files:** Create `src/app/api/auth/signup/route.ts`; Create `src/lib/rate-limit.ts`; Test `src/lib/rate-limit.test.ts`.

- [ ] **Step 1: Rate-limit helper test**
```ts
// src/lib/rate-limit.test.ts
import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";
describe("rateLimit", () => {
  it("allows up to N then blocks within the window", () => {
    const key = "ip-1:test";
    let allowed = 0;
    for (let i = 0; i < 7; i++) if (rateLimit(key, 5, 60_000)) allowed++;
    expect(allowed).toBe(5);
  });
});
```

- [ ] **Step 2: Implement rate-limit (in-memory)**
```ts
// src/lib/rate-limit.ts
const hits = new Map<string, { count: number; resetAt: number }>();
/** Returns true if allowed, false if over `max` within `windowMs`. In-memory (single region; MVP). */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now > e.resetAt) { hits.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (e.count >= max) return false;
  e.count++;
  return true;
}
```
Run: `npm test -- src/lib/rate-limit.test.ts` → PASS.

- [ ] **Step 3: Implement the signup route**
```ts
// src/app/api/auth/signup/route.ts
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
```
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/rate-limit.ts src/lib/rate-limit.test.ts src/app/api/auth/signup/route.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): POST /api/auth/signup (verify-first, rate-limited)"
```

---

## Task 7: Verify endpoint + page

**Files:** Create `src/app/api/auth/verify/route.ts`, `src/app/verify/page.tsx`.

- [ ] **Step 1: Implement verify route**
```ts
// src/app/api/auth/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { createTenantWithAdmin } from "@/lib/tenant/provision";
import { slugify, TRIAL_DAYS } from "@/lib/signup";
import { setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let token: string | undefined;
  try { token = (await req.json()).token; } catch { /* ignore */ }
  if (!token) return NextResponse.json({ error: "Token ausente." }, { status: 400 });

  const pending = await basePrisma.pendingSignup.findUnique({ where: { token } });
  if (!pending) return NextResponse.json({ error: "Link inválido ou já utilizado." }, { status: 400 });
  if (pending.expires_at < new Date()) {
    await basePrisma.pendingSignup.delete({ where: { id: pending.id } });
    return NextResponse.json({ error: "Link expirado. Faça o cadastro novamente." }, { status: 410 });
  }
  // Race safety: email must still be free.
  const taken = await basePrisma.user.findUnique({ where: { email: pending.email }, select: { id: true } });
  if (taken) {
    await basePrisma.pendingSignup.delete({ where: { id: pending.id } });
    return NextResponse.json({ error: "Este e-mail já tem uma conta. Faça login." }, { status: 409 });
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60_000);
  const res = await createTenantWithAdmin({
    name: pending.loja, slugBase: slugify(pending.loja), email: pending.email,
    passwordHash: pending.password_hash, plan: pending.plan, trialEndsAt,
  });
  await basePrisma.pendingSignup.delete({ where: { id: pending.id } });

  await setSessionCookie({ userId: res.userId, role: "ADMIN", name: "Administrador", tenantId: res.tenantId, trialEndsAt: trialEndsAt.toISOString() });
  return NextResponse.json({ ok: true });
}
```
Note: `setSessionCookie` accepts the extended `SessionPayload` (Task 5). The user's name is "Administrador" (matches provision); keep it simple.

- [ ] **Step 2: Implement the verify page**
```tsx
// src/app/verify/page.tsx
"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Verify() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "error">("loading");
  const [msg, setMsg] = useState("Confirmando seu e-mail...");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setState("error"); setMsg("Link inválido."); return; }
    fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        if (r.ok) { router.replace("/"); router.refresh(); return; }
        const d = await r.json().catch(() => ({}));
        setState("error"); setMsg(d.error ?? "Não foi possível confirmar.");
      })
      .catch(() => { setState("error"); setMsg("Erro de conexão."); });
  }, [params, router]);
  return (
    <div>
      <p>{msg}</p>
      {state === "error" && <a href="/signup" style={{ color: "#16a34a", fontWeight: 600 }}>Voltar ao cadastro</a>}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <Suspense><Verify /></Suspense>
    </main>
  );
}
```
`/verify` and `/signup` must be public — confirm in Task 9 middleware that they're in `PUBLIC_PATHS`.

- [ ] **Step 3: Type-check + commit**
Run `npx tsc --noEmit` → clean.
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/app/api/auth/verify/route.ts src/app/verify/page.tsx && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): verify endpoint + /verify page (creates tenant, logs in)"
```

---

## Task 8: Resend-verification endpoint

**Files:** Create `src/app/api/auth/resend-verification/route.ts`.

- [ ] **Step 1: Implement**
```ts
// src/app/api/auth/resend-verification/route.ts
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
```

- [ ] **Step 2: Type-check + commit**
```bash
npx tsc --noEmit
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/app/api/auth/resend-verification/route.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): resend-verification endpoint (rate-limited, no enumeration)"
```

---

## Task 9: Trial gate (middleware) + `/assinar` paywall

**Files:** Modify `src/middleware.ts`; Create `src/app/assinar/page.tsx`.

- [ ] **Step 1: Add public paths + trial gate to middleware**
Read `src/middleware.ts`. Update `PUBLIC_PATHS` to include signup/verify/assinar:
```ts
const PUBLIC_PATHS = ["/login", "/signup", "/verify", "/assinar", "/api/auth/login", "/api/auth/signup", "/api/auth/verify", "/api/auth/resend-verification"];
```
After the existing session check (where `session` is non-null), add the trial gate for page routes (not `/api/`):
```ts
// Trial gate: expired trial -> /assinar (data preserved). null/absent trialEndsAt => never gated.
if (!pathname.startsWith("/api/")) {
  const t = (session as { trialEndsAt?: string | null }).trialEndsAt;
  if (t && new Date(t).getTime() < Date.now() && pathname !== "/assinar") {
    return NextResponse.redirect(new URL("/assinar", req.url));
  }
}
```
(`/assinar` is in `PUBLIC_PATHS` so it renders; the `pathname !== "/assinar"` guard prevents a redirect loop.)

- [ ] **Step 2: Check the logout route's method**
Read `src/app/api/auth/logout/route.ts` to confirm it's POST (it is). The paywall logout uses it.

- [ ] **Step 3: Implement the paywall page**
```tsx
// src/app/assinar/page.tsx
"use client";
const WHATSAPP_URL = "https://wa.me/5513997164200";
export default function AssinarPage() {
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold">Seu teste grátis terminou</h1>
      <p className="text-slate-600">Seus dados estão salvos. Assine para continuar usando o PDV ZapFlow com tudo que você já configurou.</p>
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-brand-green px-6 py-3 font-semibold text-white">Assinar pelo WhatsApp</a>
      <button onClick={logout} className="text-sm text-slate-500 underline">Sair</button>
    </main>
  );
}
```

- [ ] **Step 4: Type-check + commit**
```bash
npx tsc --noEmit
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/middleware.ts src/app/assinar/page.tsx && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): middleware trial gate + /assinar paywall"
```

---

## Task 10: `/signup` page

**Files:** Create `src/app/signup/page.tsx`.

- [ ] **Step 1: Implement (client form)**
```tsx
// src/app/signup/page.tsx
"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function SignupForm() {
  const params = useSearchParams();
  const initialPlan = params.get("plan") === "basic" ? "basic" : "pro";
  const [plan, setPlan] = useState(initialPlan);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const f = new FormData(e.currentTarget);
    const body = { loja: f.get("loja"), name: f.get("name"), email: f.get("email"), password: f.get("password"), plan, website: f.get("website") };
    const r = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (r.ok) { setSent(true); return; }
    const d = await r.json().catch(() => ({}));
    setErr(d.error ?? "Não foi possível cadastrar.");
  }

  if (sent) return (
    <div className="text-center">
      <h1 className="text-2xl font-bold">Confirme seu e-mail</h1>
      <p className="mt-2 text-slate-600">Enviamos um link de confirmação. Clique nele para ativar seu teste grátis de 7 dias.</p>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
      <h1 className="text-2xl font-bold">Criar conta · plano {plan === "pro" ? "Pro" : "Basic"}</h1>
      <input name="loja" required placeholder="Nome da loja" className="w-full rounded-lg border px-3 py-2" />
      <input name="name" required placeholder="Seu nome" className="w-full rounded-lg border px-3 py-2" />
      <input name="email" type="email" required placeholder="E-mail" className="w-full rounded-lg border px-3 py-2" />
      <input name="password" type="password" required minLength={8} placeholder="Senha (mín. 8)" className="w-full rounded-lg border px-3 py-2" />
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => setPlan("basic")} className={`flex-1 rounded-lg border py-2 ${plan==="basic"?"border-brand-green font-semibold":""}`}>Basic</button>
        <button type="button" onClick={() => setPlan("pro")} className={`flex-1 rounded-lg border py-2 ${plan==="pro"?"border-brand-green font-semibold":""}`}>Pro</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button disabled={loading} className="w-full rounded-lg bg-brand-green py-3 font-semibold text-white disabled:opacity-60">{loading ? "Enviando..." : "Começar teste grátis"}</button>
      <p className="text-center text-xs text-slate-500">7 dias grátis. Já tem conta? <a href="/login" className="underline">Entrar</a></p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Suspense><SignupForm /></Suspense>
    </main>
  );
}
```
(`useSearchParams` requires the `<Suspense>` wrapper in the App Router.)

- [ ] **Step 2: Type-check + build + commit**
Run `npx tsc --noEmit && npm run build` (if build only fails on env/page-data collection, rely on tsc per the project caveat).
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/app/signup/page.tsx && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): /signup page"
```

---

## Task 11: Trial countdown banner

**Files:** Modify `src/components/app-shell.tsx` (or the top-level authed shell).

- [ ] **Step 1: Add the banner**
Read `src/components/app-shell.tsx`. Add a client banner that fetches `/api/auth/me` and, when `data.trial?.state === "trialing"` and `daysLeft <= 3`, renders a thin bar:
```tsx
// inside app-shell (client), add an effect + state:
const [trial, setTrial] = useState<{ state: string; daysLeft: number | null } | null>(null);
useEffect(() => { fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => d?.trial && setTrial(d.trial)).catch(() => {}); }, []);
// ...near the top of the shell's main content:
{trial?.state === "trialing" && trial.daysLeft !== null && trial.daysLeft <= 3 && (
  <div className="bg-amber-500/15 text-amber-800 text-sm text-center py-2 px-4">
    Seu teste grátis termina em {trial.daysLeft} {trial.daysLeft === 1 ? "dia" : "dias"}. <a href="/assinar" className="underline font-semibold">Assinar</a>
  </div>
)}
```
Match the file's existing imports/structure (it already fetches `/api/auth/me` for the sidebar in some setups — reuse if present).

- [ ] **Step 2: Type-check + commit**
```bash
npx tsc --noEmit
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/components/app-shell.tsx && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(signup): trial countdown banner in app shell"
```

---

## Task 12: Landing CTA wiring (zapflow-landing)

**Files:** Modify `~/Projetos/PDV/zapflow-landing/src/app/page.tsx`.

> ⚠️ The landing working tree has an uncommitted redesign. Coordinate with the user before committing/deploying (see spec §6). This task only changes CTA hrefs.

- [ ] **Step 1: Point CTAs at signup**
In `page.tsx`, there is a `const APP_URL = ...`. Change the CTAs:
- Basic card CTA → `${APP_URL}/signup?plan=basic`
- Pro card CTA → `${APP_URL}/signup?plan=pro`
- Generic "Começar agora" / "Teste grátis por 7 dias" → `${APP_URL}/signup?plan=pro`
- Enterprise / `#planos` / WhatsApp links → unchanged.
If the plan cards map over `src/lib/plans.ts`, derive `signupHref` from `plan.id` and use it per card.

- [ ] **Step 2: Build check**
Run: `cd /Users/andrecury/Projetos/PDV/zapflow-landing && npm run build` → succeeds.

- [ ] **Step 3: Commit (do NOT deploy without user sign-off on the redesign)**
```bash
git -C /Users/andrecury/Projetos/PDV/zapflow-landing add src/app/page.tsx && git -C /Users/andrecury/Projetos/PDV/zapflow-landing commit -m "feat: wire landing CTAs to app self-serve signup"
```

---

## Task 13: Rollout (DB + env + verify)

> Operational. Shared prod=dev DB; `db push` on the session pooler (port 5432, no `pgbouncer=true`).

- [ ] **Step 1: Set env (local + Vercel prod)**
`RESEND_API_KEY`, `EMAIL_FROM` (verified Resend domain), `APP_URL=https://pdv-zap-flow.vercel.app`.

- [ ] **Step 2: Push schema**
Run (session pooler URL): `npx prisma db push` → creates `pending_signups` + `tenants.trial_ends_at` (additive; existing rows get null trial_ends_at = no limit).

- [ ] **Step 3: Merge + deploy**
Merge `feat/self-serve-signup` → `main`, push (Vercel deploys).

- [ ] **Step 4: Live verification**
- Visit `${APP_URL}/signup?plan=pro`, submit with a real inbox → receive email → click link → land in app.
- Confirm a new tenant exists (`npm run tenant:list`) with a `trial_ends_at` ~7 days out.
- Force-expire it (`UPDATE tenants SET trial_ends_at = now() - interval '1 day' WHERE slug = '<new>'`), reload app → redirected to `/assinar`. Delete the test tenant after.
- Confirm `loja-principal` (null trial_ends_at) is never gated.

---

## Task 14: Final verification

- [ ] **Step 1: Suite + types + build**
```bash
npm test && npx tsc --noEmit && npm run build
```
Expected: all unit tests pass (signup helpers, provision, email, rate-limit), types clean, build green.

- [ ] **Step 2: (Optional) e2e** — signup→verify (mock email)→app; expired→/assinar.
