# Pay-Upfront Signup via InfinitePay (Model B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor pays on the landing via InfinitePay and — only after payment clears — gets an active, auto-logged-in account; access lapses to a renew paywall each month.

**Architecture:** Payment-first: a landing cadastro form calls the PDV `POST /api/signup/checkout`, which stores a pending row keyed by a random `order_nsu` and returns an InfinitePay Checkout link. Payment fires an InfinitePay **webhook** that creates the tenant+admin (active, `paid_until = +1 month`) via the existing provision service. The success `redirect_url` auto-logs the payer in. The middleware gates on `paid_until`. Replaces the deployed 7-day trial + Resend email-verification.

**Tech Stack:** Next.js 15 (App Router), Prisma 6 + Postgres (Supabase), TypeScript, Vitest, InfinitePay Checkout API.

**Spec:** `docs/superpowers/specs/2026-07-01-pay-upfront-signup-design.md`
**Branch:** `feat/pay-upfront-signup` (off `main`)
**Run:** `npm test`, `npx tsc --noEmit`, `npm run build`.

> ⚠️ **InfinitePay API is public-docs-derived.** The exact `POST https://api.checkout.infinitepay.io/links` request/response and the webhook signature scheme MUST be confirmed against InfinitePay's authenticated developer docs (or a test call with a real token) at build time. Tasks 4 & 7 mark the fields to verify; keep the interface stable and adjust the wire details.

**Reused (read first):** `src/lib/tenant/provision.ts` (`createTenantWithAdmin`), `src/lib/signup.ts` (`validateSignup`, `slugify`), `src/lib/auth.ts` (`hashPassword`, `createSessionToken`, `setSessionCookie`, `SESSION_COOKIE`, `SessionPayload`), `src/lib/prisma.ts` (`basePrisma`), `src/lib/rate-limit.ts`, `src/lib/entitlements.ts` (`Plan`, `PLANS`), `src/middleware.ts`, `src/lib/auth-edge.ts`.

---

## Task 0: Branch

- [ ] **Step 1**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow checkout main && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow checkout -b feat/pay-upfront-signup
```

---

## Task 1: Plan prices — `src/lib/billing/prices.ts`

**Files:** Create `src/lib/billing/prices.ts`, `src/lib/billing/prices.test.ts`.

- [ ] **Step 1: Failing test**
```ts
// src/lib/billing/prices.test.ts
import { describe, it, expect } from "vitest";
import { PLAN_PRICE_CENTS, priceForPlan } from "./prices";
describe("plan prices", () => {
  it("matches the landing pricing (centavos)", () => {
    expect(PLAN_PRICE_CENTS.basic).toBe(8900);
    expect(PLAN_PRICE_CENTS.pro).toBe(16900);
  });
  it("priceForPlan returns cents for a valid plan", () => {
    expect(priceForPlan("pro")).toBe(16900);
  });
  it("priceForPlan throws for enterprise (not self-serve)", () => {
    expect(() => priceForPlan("enterprise" as never)).toThrow();
  });
});
```
- [ ] **Step 2:** `npm test -- src/lib/billing/prices.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
// src/lib/billing/prices.ts
// Monthly price per self-serve plan, in centavos. Mirror zapflow-landing/src/lib/plans.ts.
export const PLAN_PRICE_CENTS = { basic: 8900, pro: 16900 } as const;
export type PaidPlan = keyof typeof PLAN_PRICE_CENTS;

export function priceForPlan(plan: PaidPlan): number {
  const cents = PLAN_PRICE_CENTS[plan];
  if (!cents) throw new Error(`No self-serve price for plan "${plan}"`);
  return cents;
}
```
- [ ] **Step 4:** `npm test -- src/lib/billing/prices.test.ts` → PASS.
- [ ] **Step 5:** `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/billing && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(billing): plan prices in centavos"`

---

## Task 2: Schema — repurpose `PendingSignup` + `Tenant.paid_until`

**Files:** Modify `prisma/schema.prisma`. (No `db push` — rollout = Task 12.)

- [ ] **Step 1: Replace the `PendingSignup` model** with the pay-pending shape and add `paid_until` to `Tenant`:
```prisma
model PendingSignup {
  id                String   @id @default(cuid())
  order_nsu         String   @unique
  email             String
  name              String
  loja              String
  password_hash     String
  plan              Plan
  amount_cents      Int
  invoice_slug      String?
  status            String   @default("pending") // pending | paid | consumed
  created_tenant_id String?
  created_user_id   String?
  expires_at        DateTime
  created_at        DateTime @default(now())

  @@map("pending_signups")
}
```
In `model Tenant { ... }` add (keep the now-unused `trial_ends_at` column):
```prisma
  paid_until    DateTime?
```
- [ ] **Step 2:** `cd /Users/andrecury/Projetos/PDV/PDV-ZapFlow && npx prisma generate` → success.
- [ ] **Step 3:** `npx tsc --noEmit` → the trial code that referenced the old `PendingSignup` fields (`token`) will now error; those files are removed in Task 10, so expect errors ONLY in `src/app/api/auth/{signup,verify,resend-verification}/route.ts`. Note them; they get deleted in Task 10. If any OTHER file errors, report it.
- [ ] **Step 4:** `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add prisma/schema.prisma && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(billing): pay-pending PendingSignup + Tenant.paid_until"`

---

## Task 3: Provision service — set `paid_until` instead of `trial_ends_at`

**Files:** Modify `src/lib/tenant/provision.ts`, `src/lib/tenant/provision.test.ts`, `scripts/create-tenant.ts`.

- [ ] **Step 1: Update the test** — rename `trialEndsAt` → `paidUntil` and assert `paid_until` in the create data:
In `provision.test.ts`, change the `createTenantWithAdmin` call's `trialEndsAt: trial` to `paidUntil: trial`, and the expected tenant create data from `trial_ends_at: trial` to `paid_until: trial`.
- [ ] **Step 2:** `npm test -- src/lib/tenant/provision.test.ts` → FAIL (still sets trial_ends_at).
- [ ] **Step 3: Implement** — in `src/lib/tenant/provision.ts`, change `ProvisionInput`'s `trialEndsAt: Date | null` to `paidUntil: Date | null`, and the tenant create's `trial_ends_at: i.trialEndsAt` to `paid_until: i.paidUntil`.
- [ ] **Step 4:** `npm test -- src/lib/tenant/provision.test.ts` → PASS.
- [ ] **Step 5: Fix the CLI caller** — in `scripts/create-tenant.ts`, change `trialEndsAt: null` to `paidUntil: null` in the `createTenantWithAdmin` call.
- [ ] **Step 6:** `npx tsc --noEmit` (expect only the Task-10 auth routes to error) then `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/tenant scripts/create-tenant.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(billing): provision sets paid_until"`

---

## Task 4: InfinitePay checkout lib — `src/lib/infinitepay/checkout.ts`

**Files:** Create `src/lib/infinitepay/checkout.ts`, `src/lib/infinitepay/checkout.test.ts`.

> ⚠️ Confirm the exact endpoint, auth header, request keys, and response keys against InfinitePay's live docs. Keep the function signature; adjust the wire mapping.

- [ ] **Step 1: Failing test (fetch mocked)**
```ts
// src/lib/infinitepay/checkout.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCheckoutLink } from "./checkout";
beforeEach(() => {
  process.env.INFINITEPAY_HANDLE = "zapflow";
  process.env.INFINITEPAY_API_TOKEN = "ip_test";
  process.env.APP_URL = "https://app.test";
});
it("posts the order to InfinitePay and returns the checkout url", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://pay.test/xyz", invoice_slug: "inv_1" }) });
  vi.stubGlobal("fetch", fetchMock);
  const res = await createCheckoutLink({ orderNsu: "ord_123", amountCents: 16900, description: "Assinatura Pro" });
  expect(res).toEqual({ checkoutUrl: "https://pay.test/xyz", invoiceSlug: "inv_1" });
  const [url, opts] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.checkout.infinitepay.io/links");
  const body = JSON.parse((opts as { body: string }).body);
  expect(body.handle).toBe("zapflow");
  expect(body.order_nsu).toBe("ord_123");
  expect(body.items[0].price).toBe(16900);
  expect(body.webhook_url).toBe("https://app.test/api/webhooks/infinitepay");
  expect(body.redirect_url).toBe("https://app.test/signup/sucesso?order=ord_123");
});
it("throws when InfinitePay returns a non-ok response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" }));
  await expect(createCheckoutLink({ orderNsu: "o", amountCents: 1, description: "x" })).rejects.toThrow();
});
```
- [ ] **Step 2:** `npm test -- src/lib/infinitepay/checkout.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
// src/lib/infinitepay/checkout.ts
// ⚠️ Wire details (endpoint path, auth header, key names) are from InfinitePay public docs;
// confirm against authenticated docs and adjust if needed.
const ENDPOINT = "https://api.checkout.infinitepay.io/links";

export async function createCheckoutLink(p: { orderNsu: string; amountCents: number; description: string }): Promise<{ checkoutUrl: string; invoiceSlug: string | null }> {
  const handle = process.env.INFINITEPAY_HANDLE;
  const token = process.env.INFINITEPAY_API_TOKEN;
  const appUrl = process.env.APP_URL ?? "https://pdv-zap-flow.vercel.app";
  if (!handle || !token) throw new Error("INFINITEPAY_HANDLE and INFINITEPAY_API_TOKEN are required");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      handle,
      order_nsu: p.orderNsu,
      redirect_url: `${appUrl}/signup/sucesso?order=${p.orderNsu}`,
      webhook_url: `${appUrl}/api/webhooks/infinitepay`,
      items: [{ name: p.description, quantity: 1, price: p.amountCents }],
    }),
  });
  if (!res.ok) throw new Error(`InfinitePay link creation failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string; checkout_url?: string; invoice_slug?: string };
  const checkoutUrl = data.url ?? data.checkout_url;
  if (!checkoutUrl) throw new Error("InfinitePay response missing checkout url");
  return { checkoutUrl, invoiceSlug: data.invoice_slug ?? null };
}
```
- [ ] **Step 4:** `npm test -- src/lib/infinitepay/checkout.test.ts` → PASS.
- [ ] **Step 5:** `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/infinitepay && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(infinitepay): checkout link creation"`

---

## Task 5: Access status + session cookie/gate switch to `paidUntil`

**Files:** Create `src/lib/billing/status.ts` (+ test); Modify `src/lib/auth.ts`, `src/lib/auth-edge.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/me/route.ts`, `src/middleware.ts`.

- [ ] **Step 1: Status helper test**
```ts
// src/lib/billing/status.test.ts
import { describe, it, expect } from "vitest";
import { subscriptionStatus } from "./status";
const now = new Date("2026-07-01T12:00:00Z");
it("null paid_until => active (grandfathered)", () => {
  expect(subscriptionStatus(null, now)).toEqual({ state: "active", daysLeft: null });
});
it("future => active with daysLeft", () => {
  expect(subscriptionStatus(new Date("2026-07-04T12:00:00Z"), now)).toEqual({ state: "active", daysLeft: 3 });
});
it("past => lapsed", () => {
  expect(subscriptionStatus(new Date("2026-06-30T12:00:00Z"), now)).toEqual({ state: "lapsed", daysLeft: 0 });
});
```
- [ ] **Step 2:** `npm test -- src/lib/billing/status.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
// src/lib/billing/status.ts
export type AccessState = "active" | "lapsed";
export function subscriptionStatus(paidUntil: Date | null, now: Date = new Date()): { state: AccessState; daysLeft: number | null } {
  if (!paidUntil) return { state: "active", daysLeft: null };
  const ms = paidUntil.getTime() - now.getTime();
  if (ms <= 0) return { state: "lapsed", daysLeft: 0 };
  return { state: "active", daysLeft: Math.ceil(ms / 86_400_000) };
}
```
`npm test -- src/lib/billing/status.test.ts` → PASS.
- [ ] **Step 4: Cookie/gate rename** — do a targeted rename `trialEndsAt` → `paidUntil` in the session layer:
  - `src/lib/auth.ts`: in `interface SessionPayload`, rename `trialEndsAt?: string | null` → `paidUntil?: string | null`.
  - `src/lib/auth-edge.ts`: same rename in its payload interface.
  - `src/app/api/auth/login/route.ts`: change the tenant select from `trial_ends_at` → `paid_until`, and the cookie payload field `trialEndsAt: ...toISOString()` → `paidUntil: tenant?.paid_until ? tenant.paid_until.toISOString() : null`.
  - `src/app/api/auth/me/route.ts`: import `subscriptionStatus` from `@/lib/billing/status` (replace `trialStatus`), read `tenant.paid_until`, return `subscription: subscriptionStatus(tenant?.paid_until ?? null)` (replace the `trial` field).
  - `src/middleware.ts`: the trial gate reads `session.trialEndsAt`; rename to `session.paidUntil`; keep the same "past → redirect to /assinar, null never gates" logic.
- [ ] **Step 5:** `npx tsc --noEmit` (expect only Task-10 auth routes to error) then `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/billing src/lib/auth.ts src/lib/auth-edge.ts src/app/api/auth/login/route.ts src/app/api/auth/me/route.ts src/middleware.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(billing): gate on paid_until; subscriptionStatus"`

---

## Task 6: Checkout endpoint — `POST /api/signup/checkout` (+ CORS)

**Files:** Create `src/app/api/signup/checkout/route.ts`; Create `src/lib/cors.ts`.

- [ ] **Step 1: CORS helper**
```ts
// src/lib/cors.ts
const ALLOWED = new Set([
  "https://zapflow-landing.vercel.app",
  // add the production landing domain here when it exists
]);
export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.has(origin) ? origin : "https://zapflow-landing.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
```
- [ ] **Step 2: Implement the route**
```ts
// src/app/api/signup/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { basePrisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { validateSignup, type SignupInput } from "@/lib/signup";
import { priceForPlan, type PaidPlan } from "@/lib/billing/prices";
import { createCheckoutLink } from "@/lib/infinitepay/checkout";
import { rateLimit } from "@/lib/rate-limit";
import { corsHeaders } from "@/lib/cors";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`checkout:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429, headers: cors });
  }
  let body: SignupInput;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requisição inválida." }, { status: 400, headers: cors }); }
  const v = validateSignup(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: cors });

  const email = body.email.toLowerCase().trim();
  const existing = await basePrisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "Este e-mail já tem uma conta. Faça login." }, { status: 409, headers: cors });

  const orderNsu = randomBytes(32).toString("hex");
  const plan = body.plan as PaidPlan;
  const amountCents = priceForPlan(plan);
  await basePrisma.pendingSignup.create({
    data: { order_nsu: orderNsu, email, name: body.name.trim(), loja: body.loja.trim(), password_hash: hashPassword(body.password), plan, amount_cents: amountCents, status: "pending", expires_at: new Date(Date.now() + 2 * 60 * 60_000) },
  });

  try {
    const { checkoutUrl, invoiceSlug } = await createCheckoutLink({ orderNsu, amountCents, description: `Assinatura ${plan === "pro" ? "Pro" : "Basic"} — PDV ZapFlow` });
    await basePrisma.pendingSignup.update({ where: { order_nsu: orderNsu }, data: { invoice_slug: invoiceSlug } });
    return NextResponse.json({ checkout_url: checkoutUrl }, { headers: cors });
  } catch {
    await basePrisma.pendingSignup.deleteMany({ where: { order_nsu: orderNsu } });
    return NextResponse.json({ error: "Não foi possível iniciar o pagamento. Tente novamente." }, { status: 502, headers: cors });
  }
}
```
- [ ] **Step 3:** `npx tsc --noEmit` (Task-10 routes aside) → clean for this file. Commit:
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/lib/cors.ts src/app/api/signup/checkout/route.ts && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(billing): POST /api/signup/checkout (creates pending + InfinitePay link, CORS)"
```

---

## Task 7: Webhook — `POST /api/webhooks/infinitepay`

**Files:** Create `src/app/api/webhooks/infinitepay/route.ts`; Test `src/app/api/webhooks/infinitepay/route.test.ts`.

> ⚠️ Confirm InfinitePay's webhook body keys (`order_nsu`, `paid_amount`, `invoice_slug`, `transaction_nsu`) and signature scheme against live docs. The handler below verifies order + amount and is idempotent; add signature verification if InfinitePay provides one.

- [ ] **Step 1: Failing test (DB + provision mocked)**
```ts
// src/app/api/webhooks/infinitepay/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const findUnique = vi.fn(); const update = vi.fn(); const provision = vi.fn();
vi.mock("@/lib/prisma", () => ({ basePrisma: { pendingSignup: { findUnique: (a: unknown) => findUnique(a), update: (a: unknown) => update(a) }, tenant: { findUnique: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/tenant/provision", () => ({ createTenantWithAdmin: (a: unknown) => provision(a) }));
import { POST } from "./route";
function req(body: unknown) { return new Request("http://x/api/webhooks/infinitepay", { method: "POST", body: JSON.stringify(body) }) as never; }
beforeEach(() => { findUnique.mockReset(); update.mockReset(); provision.mockReset(); });

it("creates the account once for a valid paid webhook", async () => {
  findUnique.mockResolvedValue({ id: "p1", order_nsu: "o1", status: "pending", amount_cents: 16900, plan: "pro", loja: "Loja", name: "Ana", email: "a@b.com", password_hash: "h", created_tenant_id: null });
  provision.mockResolvedValue({ tenantId: "t1", slug: "loja", userId: "u1" });
  const res = await POST(req({ order_nsu: "o1", paid_amount: 16900 }));
  expect(res.status).toBe(200);
  expect(provision).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { order_nsu: "o1" }, data: expect.objectContaining({ status: "paid", created_tenant_id: "t1", created_user_id: "u1" }) }));
});
it("is a no-op when already paid (idempotent)", async () => {
  findUnique.mockResolvedValue({ id: "p1", order_nsu: "o1", status: "paid", amount_cents: 16900 });
  const res = await POST(req({ order_nsu: "o1", paid_amount: 16900 }));
  expect(res.status).toBe(200); expect(provision).not.toHaveBeenCalled();
});
it("rejects an unknown order", async () => {
  findUnique.mockResolvedValue(null);
  const res = await POST(req({ order_nsu: "nope", paid_amount: 1 }));
  expect(res.status).toBe(200); expect(provision).not.toHaveBeenCalled();
});
it("rejects an amount mismatch", async () => {
  findUnique.mockResolvedValue({ id: "p1", order_nsu: "o1", status: "pending", amount_cents: 16900, plan: "pro", loja: "L", name: "A", email: "a@b.com", password_hash: "h", created_tenant_id: null });
  const res = await POST(req({ order_nsu: "o1", paid_amount: 100 }));
  expect(res.status).toBe(200); expect(provision).not.toHaveBeenCalled();
});
```
- [ ] **Step 2:** `npm test -- src/app/api/webhooks/infinitepay/route.test.ts` → FAIL.
- [ ] **Step 3: Implement** (new-account path; the renewal extend-existing branch is added in Task 9)
```ts
// src/app/api/webhooks/infinitepay/route.ts
import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { createTenantWithAdmin } from "@/lib/tenant/provision";
import { slugify } from "@/lib/signup";
import type { Plan } from "@/lib/entitlements";

const PERIOD_MS = 30 * 24 * 60 * 60_000; // ~1 month

export async function POST(req: Request) {
  let body: { order_nsu?: string; paid_amount?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const orderNsu = body.order_nsu;
  if (!orderNsu || typeof orderNsu !== "string") return NextResponse.json({ ok: true });

  const pending = await basePrisma.pendingSignup.findUnique({ where: { order_nsu: orderNsu } });
  // Always 200 (so InfinitePay stops retrying) but only act on a valid, first-time, amount-matching event.
  if (!pending) return NextResponse.json({ ok: true });
  if (pending.status !== "pending") return NextResponse.json({ ok: true }); // idempotent
  if (typeof body.paid_amount !== "number" || body.paid_amount !== pending.amount_cents) {
    console.error("[infinitepay] amount mismatch", { orderNsu, expected: pending.amount_cents, got: body.paid_amount });
    return NextResponse.json({ ok: true });
  }

  const res = await createTenantWithAdmin({
    name: pending.loja, slugBase: slugify(pending.loja), email: pending.email,
    passwordHash: pending.password_hash, plan: pending.plan as Plan,
    paidUntil: new Date(Date.now() + PERIOD_MS), adminName: pending.name,
  });
  await basePrisma.pendingSignup.update({ where: { order_nsu: orderNsu }, data: { status: "paid", created_tenant_id: res.tenantId, created_user_id: res.userId } });
  return NextResponse.json({ ok: true });
}
```
- [ ] **Step 4:** `npm test -- src/app/api/webhooks/infinitepay/route.test.ts` → PASS.
- [ ] **Step 5:** `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/app/api/webhooks/infinitepay && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(infinitepay): payment webhook creates paid account (idempotent, amount-checked)"`

---

## Task 8: Success page + status endpoint (auto-login)

**Files:** Create `src/app/api/signup/status/route.ts`, `src/app/signup/sucesso/page.tsx`.

- [ ] **Step 1: Status/auto-login endpoint** — given `order`, if the pending is `paid`, set the session cookie and mark `consumed`:
```ts
// src/app/api/signup/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const order = new URL(req.url).searchParams.get("order");
  if (!order) return NextResponse.json({ status: "unknown" }, { status: 400 });
  const pending = await basePrisma.pendingSignup.findUnique({ where: { order_nsu: order } });
  if (!pending) return NextResponse.json({ status: "unknown" });
  if (pending.status === "pending") return NextResponse.json({ status: "pending" });
  // paid or consumed → establish the session for the created user (single-use auto-login)
  if (pending.created_user_id && pending.created_tenant_id) {
    const tenant = await basePrisma.tenant.findUnique({ where: { id: pending.created_tenant_id }, select: { paid_until: true } });
    await setSessionCookie({ userId: pending.created_user_id, role: "ADMIN", name: pending.name, tenantId: pending.created_tenant_id, paidUntil: tenant?.paid_until ? tenant.paid_until.toISOString() : null });
    if (pending.status !== "consumed") await basePrisma.pendingSignup.update({ where: { order_nsu: order }, data: { status: "consumed" } });
  }
  return NextResponse.json({ status: "ready" });
}
```
(`setSessionCookie` accepts the `paidUntil`-shaped `SessionPayload` from Task 5.)
- [ ] **Step 2: Success page** (client — polls status, then redirects into the app):
```tsx
// src/app/signup/sucesso/page.tsx
"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
function Sucesso() {
  const order = useSearchParams().get("order");
  const router = useRouter();
  const [msg, setMsg] = useState("Confirmando seu pagamento…");
  useEffect(() => {
    if (!order) { setMsg("Pedido inválido."); return; }
    let tries = 0;
    const tick = async () => {
      const r = await fetch(`/api/signup/status?order=${order}`).then((x) => x.json()).catch(() => ({ status: "error" }));
      if (r.status === "ready") { router.replace("/"); router.refresh(); return; }
      if (r.status === "pending" && tries++ < 15) { setTimeout(tick, 2000); return; }
      setMsg("Pagamento em processamento. Você receberá acesso em instantes — se já pagou, tente entrar em alguns minutos.");
    };
    tick();
  }, [order, router]);
  return <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}><p>{msg}</p></main>;
}
export default function Page() { return <main><Suspense><Sucesso /></Suspense></main>; }
```
- [ ] **Step 3:** `npx tsc --noEmit` (Task-10 aside) then commit:
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/app/api/signup/status src/app/signup/sucesso && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(billing): success page + auto-login status endpoint"
```

---

## Task 9: Renewal — `/api/subscription/renew-checkout` + `/assinar` rework

**Files:** Create `src/app/api/subscription/renew-checkout/route.ts`; Modify `src/app/api/webhooks/infinitepay/route.ts` (+ its test); Modify `src/app/assinar/page.tsx`.

- [ ] **Step 1: Renew endpoint** — authenticated; creates a fresh InfinitePay link tied to the tenant's plan (the pending row carries `created_tenant_id` so the webhook extends):
```ts
// src/app/api/subscription/renew-checkout/route.ts
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import { priceForPlan, type PaidPlan } from "@/lib/billing/prices";
import { createCheckoutLink } from "@/lib/infinitepay/checkout";
import { planFromTenant } from "@/lib/entitlements";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const tenant = await basePrisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true, plan: true } });
  if (!tenant) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  const plan = planFromTenant(tenant.plan);
  if (plan !== "basic" && plan !== "pro") return NextResponse.json({ error: "Plano sob medida — fale com a gente." }, { status: 400 });
  const orderNsu = randomBytes(32).toString("hex");
  const amountCents = priceForPlan(plan as PaidPlan);
  await basePrisma.pendingSignup.create({ data: { order_nsu: orderNsu, email: `renew+${session.tenantId}@zapflow.internal`, name: tenant.name, loja: tenant.name, password_hash: "-", plan, amount_cents: amountCents, status: "pending", created_tenant_id: session.tenantId, expires_at: new Date(Date.now() + 2 * 60 * 60_000) } });
  try {
    const { checkoutUrl } = await createCheckoutLink({ orderNsu, amountCents, description: `Renovação ${plan === "pro" ? "Pro" : "Basic"} — PDV ZapFlow` });
    return NextResponse.json({ checkout_url: checkoutUrl });
  } catch {
    await basePrisma.pendingSignup.deleteMany({ where: { order_nsu: orderNsu } });
    return NextResponse.json({ error: "Não foi possível iniciar o pagamento." }, { status: 502 });
  }
}
```
- [ ] **Step 2: Webhook extend-existing** — in `src/app/api/webhooks/infinitepay/route.ts`, before the `createTenantWithAdmin` block (but after the amount check), add the renewal branch:
```ts
  if (pending.created_tenant_id) {
    const t = await basePrisma.tenant.findUnique({ where: { id: pending.created_tenant_id }, select: { paid_until: true } });
    const base = t?.paid_until && t.paid_until > new Date() ? t.paid_until.getTime() : Date.now();
    await basePrisma.tenant.update({ where: { id: pending.created_tenant_id }, data: { paid_until: new Date(base + PERIOD_MS) } });
    await basePrisma.pendingSignup.update({ where: { order_nsu: orderNsu }, data: { status: "paid" } });
    return NextResponse.json({ ok: true });
  }
```
Add a test case to `route.test.ts`: a pending with `created_tenant_id: "t1"` + matching amount → calls `tenant.update` to extend `paid_until`, does NOT call `provision`. (Wire the `tenant.findUnique/update` mocks to return/accept values.)
- [ ] **Step 3: Rework `/assinar`** — change `src/app/assinar/page.tsx` from the trial paywall to renew: heading "Sua assinatura venceu — renove para continuar."; a "Renovar assinatura" button that `POST`s `/api/subscription/renew-checkout` and does `window.location.href = res.checkout_url`; keep the logout button and WhatsApp "falar com a gente" link.
- [ ] **Step 4:** `npm test` + `npx tsc --noEmit` (Task-10 aside) then commit:
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/app/api/subscription src/app/assinar src/app/api/webhooks && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(billing): month-to-month renewal (renew-checkout + /assinar + webhook extend)"
```

---

## Task 10: Remove the trial email-verification flow

**Files:** Delete the trial email/verify files; Modify `src/lib/signup.ts` (+ test), `src/middleware.ts`, `src/components/app-shell.tsx`, `package.json`.

- [ ] **Step 1: Delete the trial endpoints/pages/email lib**
```bash
cd /Users/andrecury/Projetos/PDV/PDV-ZapFlow
git rm src/lib/email/resend.ts src/lib/email/resend.test.ts src/app/api/auth/signup/route.ts src/app/api/auth/verify/route.ts src/app/api/auth/resend-verification/route.ts src/app/signup/page.tsx src/app/verify/page.tsx
```
- [ ] **Step 2: Prune `signup.ts`** — remove `trialStatus` and `TRIAL_DAYS` (and their tests in `signup.test.ts`) since the trial is gone; KEEP `slugify`, `validateSignup`, `SIGNUP_PLANS`, `SignupInput`. Remove `resend` from `package.json` `dependencies` and run `npm install` to update the lockfile.
- [ ] **Step 3: Middleware public paths** — in `src/middleware.ts`, update `PUBLIC_PATHS`: remove `/verify`, `/api/auth/signup`, `/api/auth/verify`, `/api/auth/resend-verification`, and `/signup` (the old page); ADD `/signup/sucesso`, `/api/signup/checkout`, `/api/signup/status`, `/api/webhooks/infinitepay`. (`/assinar` stays.)
- [ ] **Step 4: Banner** — in `src/components/app-shell.tsx`, the countdown banner now reads `data.subscription` (from `/api/auth/me`, Task 5) and shows "Sua assinatura vence em N dias" when `state==="active" && daysLeft!==null && daysLeft<=3`. Rename the field/state from `trial` → `subscription`.
- [ ] **Step 5:** `npm test` (all pass) + `npx tsc --noEmit` (now fully clean — the deleted routes were the last references to the old schema) + `npm run build`. Commit:
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add -A && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "chore(billing): remove trial email-verification flow (replaced by pay-upfront)"
```

---

## Task 11: Landing cadastro form (zapflow-landing)

**Files:** Create `~/Projetos/PDV/zapflow-landing/src/app/cadastro/page.tsx`; Modify the plan-card CTAs.

> ⚠️ Coordinate with the user on the uncommitted landing redesign before committing/deploying.

- [ ] **Step 1: Cadastro form** — a client form (loja, name, email, password, plan prefilled from `?plan=`, honeypot `website`). On submit, `POST ${APP_URL}/api/signup/checkout` with the fields (cross-origin), then on `{checkout_url}` do `window.location.href = res.checkout_url`; show inline errors on non-200. `const APP_URL = "https://pdv-zap-flow.vercel.app"`.
- [ ] **Step 2: CTAs** — point the Basic/Pro plan cards + hero "Começar agora" at `/cadastro?plan=basic|pro`.
- [ ] **Step 3:** `cd ~/Projetos/PDV/zapflow-landing && npm run build` → green. Commit (do NOT deploy without user sign-off on the redesign):
```bash
git -C /Users/andrecury/Projetos/PDV/zapflow-landing add -A && git -C /Users/andrecury/Projetos/PDV/zapflow-landing commit -m "feat: cadastro form posting to PDV checkout (pay-upfront)"
```

---

## Task 12: Rollout (needs user + InfinitePay confirmation)

- [ ] **Step 1: Confirm InfinitePay wire details** — with a real `INFINITEPAY_API_TOKEN`, confirm the `POST /links` request/response keys and the webhook body/signature; adjust `checkout.ts` (Task 4) and the webhook (Task 7) if they differ from the public-docs assumptions.
- [ ] **Step 2: Env (Vercel prod + local `.env`)** — `INFINITEPAY_HANDLE`, `INFINITEPAY_API_TOKEN` (+ `INFINITEPAY_WEBHOOK_SECRET` if offered). `APP_URL` already set.
- [ ] **Step 3: Register the webhook URL** with InfinitePay if their dashboard requires it: `https://pdv-zap-flow.vercel.app/api/webhooks/infinitepay`.
- [ ] **Step 4: `prisma db push`** (session pooler :5432) — additive (`pending_signups` new columns + `tenants.paid_until`).
- [ ] **Step 5: Merge → deploy** `feat/pay-upfront-signup` → `main` → push.
- [ ] **Step 6: Live-verify** — real cadastro on the landing → InfinitePay checkout (a small real payment / Pix) → webhook creates the account → success page auto-login → confirm `npm run tenant:list` shows the tenant with `paid_until` ~30 days out. Force-expire (`UPDATE tenants SET paid_until = now() - interval '1 day' WHERE slug='<new>'`) → app redirects to `/assinar` → renew → `paid_until` extends. Clean up the test tenant.

---

## Task 13: Final verification

- [ ] **Step 1:** `npm test && npx tsc --noEmit && npm run build` — unit suites (prices, status, checkout, webhook, provision, cors) pass; types clean; build green.
- [ ] **Step 2: (Optional) e2e** — cadastro → stubbed link → stubbed webhook → account active → auto-login; expired paid_until → /assinar → renew extends.
