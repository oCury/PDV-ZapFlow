# Entitlements Layer — Design

**Date:** 2026-06-29
**Status:** Approved (Andre, 2026-06-29). Ready for implementation plan.
**Repo:** PDV-ZapFlow
**Branch:** `feat/entitlements` (off `origin/main` @ `2335a27`, tenancy-aware base)
**Depends on:** tenancy foundation (`2026-06-25-tenancy-foundation-design.md`, merged PR #6 — `Tenant` model live on `main`).
**Source of truth for the matrix:** `2026-06-25-plans-entitlements.md`.
**Precedes:** C1 Billing & Subscriptions (`2026-06-27-commercialization-layer-scope.md`).

---

## 1. Purpose & Scope

Gate PDV-ZapFlow modules by the tenant's plan (Basic / Pro / Enterprise), so the
plan a client is on determines which features they can see and use. This is the
**feature-gating** layer only — it makes the entitlements matrix executable and
enforces it at three layers (API, UI, seat limits).

### In scope
- `src/lib/entitlements.ts` — the matrix as code (plan → allowed keys, plan → limits, helpers).
- `Tenant.plan` promoted to a Prisma enum (`Plan`), nullable, with a backfill.
- Three enforcement gates: **API routes**, **UI nav + page guards**, **seat-count limit**.
- An `/upgrade` page used as the upsell target.
- Plans assigned **manually** via the existing CLI `create-tenant` script (no self-serve).

### Out of scope (→ C1 Billing & Subscriptions)
- `Subscription` model, payment provider, webhooks.
- Runtime "is the subscription active/paid?" gate and the paywall/restricted screen.
- Self-serve plan upgrades/downgrades and checkout.
- Per-seat add-on **billing** (the matrix's "Pro = 3 + per-seat add-on"). This layer
  enforces only the plan's **included** seats; add-ons come with billing.

---

## 2. Data Model — `Tenant.plan`

Today `plan` is `String?` (nullable, free-text); the live tenant `Tenant#1`
(`loja-principal`, id `cmqtu2mxn000085ddpkmct6aq`) was backfilled with `plan = null`
and currently uses **every** module.

**Change:** introduce a Prisma enum and keep the column **nullable**.

```prisma
enum Plan {
  basic
  pro
  enterprise
}

model Tenant {
  // ...
  plan  Plan?   // null is treated as `basic` (fail-closed) by planFromTenant()
  // ...
}
```

**Why nullable enum (not NOT NULL):** avoids a NOT-NULL cast on the shared prod DB.
`String? → Plan?` casts cleanly because the only existing value is `null`. Code
normalizes `null → basic`, so a missing plan never silently grants access.

**Migration (order matters — shared prod=dev DB, `db push` on session pooler `:5432`):**
1. **Backfill first:** `UPDATE tenants SET plan = 'enterprise' WHERE slug = 'loja-principal';`
   (run before/with the deploy — otherwise fail-closed logic instantly downgrades the
   live shop the moment new code ships).
2. Apply the enum schema via `prisma db push` (session-mode pooler, port 5432, drop
   `pgbouncer=true` per repo convention).
3. Verify: `Tenant#1.plan = enterprise`; any other tenants → set/confirm intended plan.

**Rollback:** revert schema to `plan String?` and `db push`; data values remain valid
strings. No data loss.

---

## 3. Config Library — `src/lib/entitlements.ts`

Pure module, no I/O. The single source of truth, mirroring `2026-06-25-plans-entitlements.md`.

```ts
export const PLANS = ["basic", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export type EntitlementKey =
  // Basic (always on)
  | "pdv" | "catalog" | "inventory" | "payments.core" | "payments.terminal"
  | "customers" | "cashregister" | "reports.basic"
  // Pro+
  | "payments.installments" | "fiscal.nfce" | "whatsapp" | "loyalty"
  | "vouchers" | "commissions" | "deliveries" | "labels" | "tables"
  | "reports.advanced"
  // Enterprise only
  | "multistore";

const BASIC_KEYS: EntitlementKey[] = [
  "pdv", "catalog", "inventory", "payments.core", "payments.terminal",
  "customers", "cashregister", "reports.basic",
];
const PRO_KEYS: EntitlementKey[] = [
  ...BASIC_KEYS,
  "payments.installments", "fiscal.nfce", "whatsapp", "loyalty",
  "vouchers", "commissions", "deliveries", "labels", "tables", "reports.advanced",
];
const ENTERPRISE_KEYS: EntitlementKey[] = [...PRO_KEYS, "multistore"];

export const PLAN_ENTITLEMENTS: Record<Plan, ReadonlySet<EntitlementKey>> = {
  basic: new Set(BASIC_KEYS),
  pro: new Set(PRO_KEYS),
  enterprise: new Set(ENTERPRISE_KEYS),
};

export const PLAN_LIMITS: Record<Plan, { seats: number | null }> = {
  basic: { seats: 1 },
  pro: { seats: 3 },
  enterprise: { seats: null }, // unlimited
};

/** null/unknown → basic (fail-closed). */
export function planFromTenant(plan: string | null | undefined): Plan {
  return plan === "pro" || plan === "enterprise" ? plan : "basic";
}
export function hasEntitlement(plan: Plan, key: EntitlementKey): boolean {
  return PLAN_ENTITLEMENTS[plan].has(key);
}
export function allowedKeys(plan: Plan): EntitlementKey[] {
  return [...PLAN_ENTITLEMENTS[plan]];
}
export function seatLimit(plan: Plan): number | null {
  return PLAN_LIMITS[plan].seats;
}
```

> The landing's `zapflow-landing/src/lib/plans.ts` is a separate marketing mirror.
> Keeping it in literal sync is a nice-to-have, not part of this build.

---

## 4. Plan-Source Plumbing

Entitlement checks need the current tenant's plan. The session cookie
(`{ userId, role, name, tenantId }`) deliberately does **not** carry the plan
(would go stale on a future billing-driven change).

**`getCurrentTenant()`** — new helper, `cache()`-memoized per request:

```ts
import { cache } from "react";
import { basePrisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant/context";
import { planFromTenant, type Plan } from "@/lib/entitlements";

export const getCurrentTenant = cache(async (): Promise<{ id: string; name: string; plan: Plan }> => {
  const id = getTenantId();
  const t = await basePrisma.tenant.findUnique({ where: { id }, select: { id: true, name: true, plan: true } });
  if (!t) throw new Error("Tenant not found for current context");
  return { id: t.id, name: t.name, plan: planFromTenant(t.plan) };
});
```

- Uses `basePrisma` (unscoped) — `Tenant` is not a tenant-owned model.
- Fresh per request → a future C1 webhook plan-flip takes effect with no re-login.
- `getSessionUser()` is extended to join the tenant's `plan` in its existing user
  lookup, so the common authenticated path incurs no extra query.

---

## 5. Enforcement — Three Gates

### 5a. API routes
`requireEntitlement(key)` runs after the route's existing auth check:

```ts
// returns a NextResponse (403) on failure, or null on pass
export async function requireEntitlement(key: EntitlementKey): Promise<NextResponse | null> {
  const { plan } = await getCurrentTenant();
  if (!hasEntitlement(plan, key)) {
    return NextResponse.json(
      { success: false, error: "Recurso indisponível no seu plano", upgrade: true },
      { status: 403 },
    );
  }
  return null;
}
```

Usage in each protected route (auth check already present):

```ts
const session = await getSession();
if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
const gate = await requireEntitlement("whatsapp");
if (gate) return gate;
```

**Each route names its key inline** (explicit; won't drift from file-based routing).
Protected API groups (Pro+ keys) — to be confirmed in the plan: `followups`
(`whatsapp`), `commissions` (`commissions`), `vouchers` (`vouchers`), `exchanges`
(`vouchers` — the matrix bundles "Vale-presente & trocas" under one key), `labels`
(`labels`), `tables` (`tables`), `fiscal`
(`fiscal.nfce`), `cashback`/loyalty (`loyalty`), deliveries/`shipping`
(`deliveries`), advanced reports (`reports.advanced`). Always-on Basic routes
(pdv/products/customers/sales/cash-register/terminals) get **no** gate.

### 5b. UI nav + page guard
- `navItems` (in `sidebar.tsx` and `bottom-nav.tsx`) gain an optional
  `entitlement?: EntitlementKey`.
- `/api/auth/me` returns `{ user, plan, entitlements: EntitlementKey[] }`
  (the tenant's allowed keys).
- Locked item = `item.entitlement && !entitlements.includes(item.entitlement)`.
  Render it **visible but disabled with a lock icon**; click → upsell (route to
  `/upgrade?feature=<key>`) instead of navigating.
- **Direct-URL hard-block:** `requireEntitlementPage(key)` server helper at the top
  of each gated page → `redirect("/upgrade?feature=<key>")` when not entitled.
  (Pages live flat under `src/app/*`; the guard is called per gated page.)

### 5c. Seat limit
At user creation — `src/app/api/staff/route.ts` (`POST`, the `prisma.user.create`
at line ~52):

```ts
const { plan } = await getCurrentTenant();
const limit = seatLimit(plan);
if (limit !== null) {
  const count = await prisma.user.count({ where: { active: true } }); // auto-scoped to tenant
  if (count >= limit) {
    return NextResponse.json(
      { success: false, error: "Limite de usuários do seu plano atingido", upgrade: true },
      { status: 403 },
    );
  }
}
```

`prisma.user.count` is auto-scoped by the tenant `$extends`. Existing tenants over a
new limit are not a concern (the only live tenant is Enterprise = ∞).

---

## 6. Upsell UX

A lightweight `/upgrade` page (server component):
- Reads `?feature=<key>` to name the locked capability.
- Message: "Este recurso está disponível no plano Pro/Enterprise."
- WhatsApp CTA (consistent with the sales landing). No checkout — self-serve upgrade
  is C1. Both nav lock-clicks and blocked-route redirects land here.

---

## 7. Testing (Vitest — existing harness)

- **Config unit tests:** Basic ⊂ Pro ⊂ Enterprise; every matrix row maps to exactly
  one key; `planFromTenant(null | "" | "bogus") === "basic"`; `seatLimit` per plan;
  `hasEntitlement` truth table for a sample of keys.
- **Gate tests:** `requireEntitlement` returns 403 for a Basic tenant on a Pro key and
  `null` for a Pro tenant; seat limit blocks the (limit+1)-th active user and allows
  under the cap. Reuse the existing tenant test harness (`runWithTenant`) to set context.
- **Optional e2e (Playwright):** a Basic tenant sees locked nav items and is redirected
  from a Pro route to `/upgrade`.

---

## 8. Components / Files (anticipated)

| File | Change |
|---|---|
| `prisma/schema.prisma` | `enum Plan`; `Tenant.plan Plan?` |
| `src/lib/entitlements.ts` | **new** — matrix as code + helpers |
| `src/lib/tenant/current-tenant.ts` | **new** — `getCurrentTenant()` (`cache()`) |
| `src/lib/auth.ts` | `getSessionUser()` joins tenant `plan` |
| `src/lib/entitlements-guard.ts` | **new** — `requireEntitlement`, `requireEntitlementPage` |
| `src/app/api/auth/me/route.ts` | return `plan` + `entitlements[]` |
| `src/components/sidebar.tsx`, `bottom-nav.tsx` | `entitlement` on nav items + locked rendering |
| protected `src/app/api/*/route.ts` (~10) | inline `requireEntitlement(key)` |
| gated `src/app/*/page.tsx` (~10) | `requireEntitlementPage(key)` |
| `src/app/api/staff/route.ts` | seat-limit check |
| `src/app/upgrade/page.tsx` | **new** — upsell page |
| tests | `entitlements.test.ts`, guard tests, optional e2e |

---

## 9. Migration & Rollout Caution

- **Shared prod=dev Supabase DB** (`cyxghprgaahbhvvfygek`). `db push` workflow, session
  pooler `:5432`.
- **Backfill `Tenant#1 → enterprise` BEFORE the gating code is live**, or the live shop
  loses Pro/Enterprise modules the instant `null → basic` fail-closed ships.
- Suggested rollout: branch `feat/entitlements` → PR → on merge, run the backfill UPDATE
  and `db push` against prod **as part of the deploy**, not after.
- Assign plans to any future tenants via the CLI `create-tenant` script.
