# Entitlements Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate PDV-ZapFlow modules by the tenant's plan (Basic/Pro/Enterprise) at the API, UI, and seat-count layers, driven by a single config that mirrors the agreed entitlements matrix.

**Architecture:** A pure config module (`entitlements.ts`) is the single source of truth (plan → allowed keys, plan → seat limits). A `currentPlan()` helper reads the tenant's plan fresh per request from the **session cookie's `tenantId`** (not ambient AsyncLocalStorage, which isn't reliably set in `getSession()`-only routes), cached via React `cache()`. Three thin guards enforce it: `requireEntitlement(key)` in API routes, a per-module server `layout.tsx` calling `requireEntitlementPage(key)` for direct-URL hard-blocks, and a seat check at user creation. The UI nav shows locked modules disabled with a lock icon that routes to an `/upgrade` upsell page.

**Tech Stack:** Next.js 15 (App Router), Prisma 6 + PostgreSQL (Supabase), TypeScript, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-29-entitlements-layer-design.md`
**Matrix source of truth:** `docs/superpowers/specs/2026-06-25-plans-entitlements.md`
**Branch:** `feat/entitlements`

**Run tests with:** `npm test` (= `vitest run`). Type-check with `npx tsc --noEmit`. Build with `npm run build`.

---

## Task 1: Config library — `src/lib/entitlements.ts`

**Files:**
- Create: `src/lib/entitlements.ts`
- Test: `src/lib/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/entitlements.test.ts
import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ENTITLEMENTS,
  PLAN_LIMITS,
  planFromTenant,
  hasEntitlement,
  allowedKeys,
  seatLimit,
} from "./entitlements";

describe("entitlements config", () => {
  it("plan tiers are strictly nested: basic ⊂ pro ⊂ enterprise", () => {
    for (const k of PLAN_ENTITLEMENTS.basic) expect(PLAN_ENTITLEMENTS.pro.has(k)).toBe(true);
    for (const k of PLAN_ENTITLEMENTS.pro) expect(PLAN_ENTITLEMENTS.enterprise.has(k)).toBe(true);
  });

  it("only enterprise has multistore", () => {
    expect(hasEntitlement("enterprise", "multistore")).toBe(true);
    expect(hasEntitlement("pro", "multistore")).toBe(false);
    expect(hasEntitlement("basic", "multistore")).toBe(false);
  });

  it("payments.terminal is in every plan (table-stakes)", () => {
    for (const p of PLANS) expect(hasEntitlement(p, "payments.terminal")).toBe(true);
  });

  it("fiscal.nfce and whatsapp are Pro+ only", () => {
    expect(hasEntitlement("basic", "fiscal.nfce")).toBe(false);
    expect(hasEntitlement("pro", "fiscal.nfce")).toBe(true);
    expect(hasEntitlement("basic", "whatsapp")).toBe(false);
    expect(hasEntitlement("pro", "whatsapp")).toBe(true);
  });

  it("planFromTenant normalizes null/unknown to basic (fail-closed)", () => {
    expect(planFromTenant(null)).toBe("basic");
    expect(planFromTenant(undefined)).toBe("basic");
    expect(planFromTenant("")).toBe("basic");
    expect(planFromTenant("bogus")).toBe("basic");
    expect(planFromTenant("pro")).toBe("pro");
    expect(planFromTenant("enterprise")).toBe("enterprise");
  });

  it("seat limits: basic 1, pro 3, enterprise unlimited", () => {
    expect(seatLimit("basic")).toBe(1);
    expect(seatLimit("pro")).toBe(3);
    expect(seatLimit("enterprise")).toBeNull();
    expect(PLAN_LIMITS.basic.seats).toBe(1);
  });

  it("allowedKeys returns the plan's full key set", () => {
    expect(allowedKeys("basic")).toContain("pdv");
    expect(allowedKeys("basic")).not.toContain("fiscal.nfce");
    expect(allowedKeys("enterprise")).toContain("multistore");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/entitlements.test.ts`
Expected: FAIL — `Cannot find module './entitlements'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/entitlements.ts
// Single source of truth for plan gating. Mirrors
// docs/superpowers/specs/2026-06-25-plans-entitlements.md. Pure — no I/O.

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

/** Normalize a raw plan value (DB enum/string) to a Plan; null/unknown → basic (fail-closed). */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/entitlements.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/entitlements.ts src/lib/entitlements.test.ts
git commit -m "feat(entitlements): plan→key matrix config + helpers"
```

---

## Task 2: Prisma `Plan` enum + `Tenant.plan`

**Files:**
- Modify: `prisma/schema.prisma`

> No `db push` here — the column stays compatible (nullable). The live-DB migration is the deliberate rollout step (Task 12). This task only updates the schema + generated client types so code compiles.

- [ ] **Step 1: Add the enum and change the column type**

In `prisma/schema.prisma`, add the enum (place it near the other enums, e.g. after `enum UserRole`):

```prisma
enum Plan {
  basic
  pro
  enterprise
}
```

Then change the `Tenant.plan` field from `plan String?` to:

```prisma
  plan          Plan?
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success. `$Enums.Plan` now exists in the client types.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `Tenant.plan` or `Plan`. (Pre-existing unrelated errors, if any, are out of scope — note them but do not fix here.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(entitlements): Tenant.plan as Plan enum (nullable)"
```

---

## Task 3: Guard library — `src/lib/entitlements-guard.ts`

**Files:**
- Create: `src/lib/entitlements-guard.ts`
- Test: `src/lib/entitlements-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/entitlements-guard.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const findUnique = vi.fn();
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });

vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/prisma", () => ({ basePrisma: { tenant: { findUnique: (a: unknown) => findUnique(a) } } }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import { currentPlan, requireEntitlement, requireEntitlementPage } from "./entitlements-guard";

beforeEach(() => {
  getSession.mockReset();
  findUnique.mockReset();
  redirect.mockClear();
});

describe("currentPlan", () => {
  it("returns null when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    expect(await currentPlan()).toBeNull();
  });

  it("returns the tenant's plan from DB", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "pro" });
    expect(await currentPlan()).toBe("pro");
  });

  it("normalizes a null plan to basic (fail-closed)", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: null });
    expect(await currentPlan()).toBe("basic");
  });
});

describe("requireEntitlement", () => {
  it("401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await requireEntitlement("whatsapp");
    expect(res?.status).toBe(401);
  });

  it("403 when plan lacks the key", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "basic" });
    const res = await requireEntitlement("whatsapp");
    expect(res?.status).toBe(403);
  });

  it("null (pass) when plan has the key", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "pro" });
    expect(await requireEntitlement("whatsapp")).toBeNull();
  });
});

describe("requireEntitlementPage", () => {
  it("redirects to /upgrade when plan lacks the key", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "basic" });
    await expect(requireEntitlementPage("fiscal.nfce")).rejects.toThrow("REDIRECT:/upgrade?feature=fiscal.nfce");
  });

  it("does not redirect when entitled", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "pro" });
    await requireEntitlementPage("fiscal.nfce");
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/entitlements-guard.test.ts`
Expected: FAIL — `Cannot find module './entitlements-guard'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/entitlements-guard.ts
import { cache } from "react";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { basePrisma } from "@/lib/prisma";
import {
  planFromTenant,
  hasEntitlement,
  type EntitlementKey,
  type Plan,
} from "@/lib/entitlements";

/**
 * Current tenant's plan, derived from the signed session cookie's tenantId
 * (reliable in every route/page, unlike ambient AsyncLocalStorage context).
 * Fresh per request, memoized so nav + page guard share one read.
 */
export const currentPlan = cache(async (): Promise<Plan | null> => {
  const session = await getSession();
  if (!session?.tenantId) return null;
  const t = await basePrisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { plan: true },
  });
  return planFromTenant(t?.plan ?? null);
});

/** API guard: returns a NextResponse (401/403) on failure, or null to continue. */
export async function requireEntitlement(key: EntitlementKey): Promise<NextResponse | null> {
  const plan = await currentPlan();
  if (!plan) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!hasEntitlement(plan, key)) {
    return NextResponse.json(
      { success: false, error: "Recurso indisponível no seu plano", upgrade: true },
      { status: 403 },
    );
  }
  return null;
}

/** Page guard (server component): redirects to /upgrade when not entitled. */
export async function requireEntitlementPage(key: EntitlementKey): Promise<void> {
  const plan = await currentPlan();
  if (!plan) redirect("/login");
  if (!hasEntitlement(plan, key)) redirect(`/upgrade?feature=${key}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/entitlements-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entitlements-guard.ts src/lib/entitlements-guard.test.ts
git commit -m "feat(entitlements): currentPlan + API/page guards"
```

---

## Task 4: `/api/auth/me` returns plan + entitlements

**Files:**
- Modify: `src/app/api/auth/me/route.ts`

- [ ] **Step 1: Replace the route body**

```ts
// src/app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { currentPlan } from "@/lib/entitlements-guard";
import { allowedKeys } from "@/lib/entitlements";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const plan = (await currentPlan()) ?? "basic";
  return NextResponse.json({
    user: { id: session.userId, name: session.name, role: session.role },
    plan,
    entitlements: allowedKeys(plan),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/me/route.ts
git commit -m "feat(entitlements): expose plan + entitlements from /api/auth/me"
```

---

## Task 5: Sidebar nav gating

**Files:**
- Modify: `src/components/sidebar.tsx`

Map nav `href` → entitlement key (only Pro+ items get a key; Basic items get none):
`/cashback`→`loyalty`, `/exchanges`→`vouchers`, `/vouchers`→`vouchers`,
`/commissions`→`commissions`, `/labels`→`labels`, `/reports`→`reports.advanced`,
`/fiscal`→`fiscal.nfce`, `/followups`→`whatsapp`, `/tables`→`tables`, `/entregas`→`deliveries`.
(`/`, `/pdv`, `/products`, `/categories`, `/customers`, `/sales`, `/staff`, `/settings` → no key.)

- [ ] **Step 1: Add `entitlement` to the NavItem type and items**

In `src/components/sidebar.tsx`, update the interface and `navItems`:

```ts
import type { EntitlementKey } from "@/lib/entitlements";
import { Lock } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly: boolean;
  entitlement?: EntitlementKey;
}
```

Add `entitlement` to the relevant rows (leave others as-is):

```ts
  { href: "/tables", label: "Mesas", icon: UtensilsCrossed, adminOnly: false, entitlement: "tables" },
  { href: "/entregas", label: "Entregas", icon: Truck, adminOnly: false, entitlement: "deliveries" },
  { href: "/cashback", label: "Cashback", icon: Gift, adminOnly: true, entitlement: "loyalty" },
  { href: "/exchanges", label: "Trocas", icon: ArrowLeftRight, adminOnly: true, entitlement: "vouchers" },
  { href: "/vouchers", label: "Vales", icon: Ticket, adminOnly: true, entitlement: "vouchers" },
  { href: "/commissions", label: "Comissões", icon: Percent, adminOnly: true, entitlement: "commissions" },
  { href: "/labels", label: "Etiquetas", icon: Tag, adminOnly: true, entitlement: "labels" },
  { href: "/reports", label: "Relatórios", icon: BarChart3, adminOnly: true, entitlement: "reports.advanced" },
  { href: "/fiscal", label: "Fiscal", icon: FileText, adminOnly: true, entitlement: "fiscal.nfce" },
  { href: "/followups", label: "Follow-up", icon: MessageCircle, adminOnly: true, entitlement: "whatsapp" },
```

- [ ] **Step 2: Fetch and store entitlements from `/api/auth/me`**

Extend the `UserInfo` interface and the fetch handler so the component holds the allowed keys. Change:

```ts
interface UserInfo {
  name: string;
  role: "ADMIN" | "EMPLOYEE";
}
```
to:
```ts
interface UserInfo {
  name: string;
  role: "ADMIN" | "EMPLOYEE";
  entitlements: EntitlementKey[];
}
```

In the `useEffect` fetch `.then((data) => { ... })`, store the entitlements too:
```ts
        if (data?.user) {
          const info: UserInfo = { ...data.user, entitlements: data.entitlements ?? [] };
          setUser(info);
          try { sessionStorage.setItem("sidebar_user", JSON.stringify(info)); } catch { /* ignored */ }
        }
```

- [ ] **Step 3: Render locked items disabled with a lock + upsell link**

Replace the `visibleItems` filter + the item render so locked items render as a link to `/upgrade` with a lock icon. First compute lock state per item instead of filtering them out by entitlement:

```ts
  const entitlements = user?.entitlements ?? [];
  const isLocked = (item: NavItem) =>
    !!item.entitlement && !entitlements.includes(item.entitlement);

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "ADMIN"
  );
```

In the JSX where each `visibleItems` row is rendered, for a locked item: render the row pointing to `/upgrade?feature=<key>`, dimmed, with a `Lock` icon overlay instead of the active highlight. Concretely, where the `<Link href={item.href} ...>` is built, branch:

```tsx
const locked = isLocked(item);
const href = locked ? `/upgrade?feature=${item.entitlement}` : item.href;
// ...in the row:
<Link
  href={href}
  className={`... ${locked ? "opacity-50" : ""}`}
  title={locked ? "Disponível em um plano superior" : undefined}
>
  <item.icon ... />
  {!collapsed && <span>{item.label}</span>}
  {locked && <Lock size={14} className="ml-auto opacity-70" />}
</Link>
```

(Keep the existing active-state styling for non-locked items.)

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles. (Build needs `SESSION_SECRET` etc. in `.env`; if build fails ONLY on env/page-data collection, rely on `npx tsc --noEmit` per the project's known caveat.)

- [ ] **Step 5: Manual verification**

Run the app (only after Task 12 DB migration, or against a local DB). As a Basic tenant, confirm Pro modules show dimmed with a lock and clicking routes to `/upgrade`. As Enterprise, all unlocked.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(entitlements): sidebar locks modules not in tenant plan"
```

---

## Task 6: Bottom-nav gating (mobile)

**Files:**
- Modify: `src/components/bottom-nav.tsx`

Only `/cashback` (→ `loyalty`) among the bottom-nav items is Pro+. The rest (`/pdv`, `/products`, `/sales`, `/settings`) are Basic.

- [ ] **Step 1: Add entitlement + fetch entitlements**

Update the `NavItem` interface and the `/cashback` row:

```ts
import type { EntitlementKey } from "@/lib/entitlements";
import { Lock } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof ShoppingCart;
  adminOnly: boolean;
  entitlement?: EntitlementKey;
}
// ...
  { href: "/cashback", label: "Cashback", icon: Gift, adminOnly: true, entitlement: "loyalty" },
```

Track entitlements in state alongside role:

```ts
  const [role, setRole] = useState<"ADMIN" | "EMPLOYEE" | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementKey[]>([]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user?.role) setRole(d.user.role);
        if (d?.entitlements) setEntitlements(d.entitlements);
      })
      .catch(() => {});
  }, []);
```

- [ ] **Step 2: Render the locked item to /upgrade**

In the `visible.map(...)`, compute `locked` and the href:

```tsx
const locked = !!item.entitlement && !entitlements.includes(item.entitlement);
const href = locked ? `/upgrade?feature=${item.entitlement}` : item.href;
```
Use `href` in the `<Link>` and add a small `Lock` badge + `opacity-50` when `locked`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/bottom-nav.tsx
git commit -m "feat(entitlements): bottom-nav locks cashback when not in plan"
```

---

## Task 7: Page hard-block via per-module `layout.tsx`

**Files (create one `layout.tsx` per gated module):**
- `src/app/followups/layout.tsx` → `whatsapp`
- `src/app/commissions/layout.tsx` → `commissions`
- `src/app/vouchers/layout.tsx` → `vouchers`
- `src/app/exchanges/layout.tsx` → `vouchers`
- `src/app/labels/layout.tsx` → `labels`
- `src/app/tables/layout.tsx` → `tables`
- `src/app/fiscal/layout.tsx` → `fiscal.nfce`
- `src/app/cashback/layout.tsx` → `loyalty`
- `src/app/entregas/layout.tsx` → `deliveries`
- `src/app/reports/layout.tsx` → `reports.advanced`

> A server `layout.tsx` wraps the (possibly client) page and runs the guard server-side on every direct navigation, so URL-typing a locked route redirects to `/upgrade`.

- [ ] **Step 1: Create each layout (substitute the key per the list above)**

Example — `src/app/followups/layout.tsx`:

```tsx
import { requireEntitlementPage } from "@/lib/entitlements-guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireEntitlementPage("whatsapp");
  return <>{children}</>;
}
```

Repeat for each module file above, changing only the entitlement key argument
(e.g. `"commissions"`, `"vouchers"`, `"labels"`, `"tables"`, `"fiscal.nfce"`,
`"loyalty"`, `"deliveries"`, `"reports.advanced"`). `vouchers` and `exchanges`
both use `"vouchers"`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/followups/layout.tsx src/app/commissions/layout.tsx src/app/vouchers/layout.tsx src/app/exchanges/layout.tsx src/app/labels/layout.tsx src/app/tables/layout.tsx src/app/fiscal/layout.tsx src/app/cashback/layout.tsx src/app/entregas/layout.tsx src/app/reports/layout.tsx
git commit -m "feat(entitlements): server layout guards hard-block locked module pages"
```

---

## Task 8: API route gating

For each module's route file(s), add the gate **immediately after the existing auth
check** (`getSession()`/`requireAdmin()`/`requireTenant()` block) and before any
business logic. The pattern (adjust the key):

```ts
import { requireEntitlement } from "@/lib/entitlements-guard";
// ...after auth check returns on no-session:
const gate = await requireEntitlement("whatsapp");
if (gate) return gate;
```

Apply to every exported handler (GET/POST/PUT/PATCH/DELETE) in the file. **Do NOT
gate** provider-called webhooks/crons (`fiscal/webhook`, `whatsapp/webhook`,
`webhooks/mercadopago`, `cron/*`) — they have no session.

- [ ] **Step 1: `whatsapp` key**

Files: `src/app/api/followups/route.ts`, `src/app/api/whatsapp/connect/route.ts`,
`src/app/api/whatsapp/send/route.ts`, `src/app/api/whatsapp/status/route.ts`,
`src/app/api/whatsapp/instance/route.ts`.
Add `const gate = await requireEntitlement("whatsapp"); if (gate) return gate;` after auth in each handler.

- [ ] **Step 2: `commissions` key**

Files: `src/app/api/commissions/calculate/route.ts`, `src/app/api/commissions/dashboard/route.ts`,
`src/app/api/commissions/rules/route.ts`, `src/app/api/commissions/rules/[id]/route.ts`.
Add `const gate = await requireEntitlement("commissions"); if (gate) return gate;`.

- [ ] **Step 3: `vouchers` key (vouchers + exchanges/trocas)**

Files: `src/app/api/vouchers/route.ts`, `src/app/api/vouchers/[code]/route.ts`,
`src/app/api/vouchers/[code]/cancel/route.ts`, `src/app/api/vouchers/[code]/redeem/route.ts`,
`src/app/api/exchanges/route.ts`, `src/app/api/exchanges/[id]/route.ts`,
`src/app/api/exchanges/[id]/cancel/route.ts`, `src/app/api/exchanges/[id]/approve/route.ts`.
Add `const gate = await requireEntitlement("vouchers"); if (gate) return gate;`.
(Skip `cron/vouchers/expire` — no session.)

- [ ] **Step 4: `labels` key**

Files: `src/app/api/labels/generate/route.ts`, `src/app/api/labels/templates/route.ts`.
Add `const gate = await requireEntitlement("labels"); if (gate) return gate;`.

- [ ] **Step 5: `tables` key**

File: `src/app/api/tables/route.ts`.
Add `const gate = await requireEntitlement("tables"); if (gate) return gate;`.

- [ ] **Step 6: `fiscal.nfce` key**

Files: `src/app/api/fiscal/emit/route.ts`, `src/app/api/fiscal/retry/route.ts`,
`src/app/api/fiscal/queue/route.ts`, `src/app/api/fiscal/cancel/[saleId]/route.ts`,
`src/app/api/fiscal/status/[saleId]/route.ts`.
Add `const gate = await requireEntitlement("fiscal.nfce"); if (gate) return gate;`.
(Skip `fiscal/webhook` — provider-called.)

- [ ] **Step 7: `loyalty` key**

File: `src/app/api/cashback/route.ts`.
Add `const gate = await requireEntitlement("loyalty"); if (gate) return gate;`.

- [ ] **Step 8: `deliveries` key**

Files: `src/app/api/deliveries/route.ts`, `src/app/api/deliveries/[saleId]/route.ts`,
`src/app/api/deliveries/[saleId]/notify/route.ts`, `src/app/api/shipping/calculate/route.ts`.
Add `const gate = await requireEntitlement("deliveries"); if (gate) return gate;`.

- [ ] **Step 9: `reports.advanced` key**

Files: `src/app/api/reports/profit-margin/route.ts`, `src/app/api/reports/period-comparison/route.ts`,
`src/app/api/reports/abc-curve/route.ts`, `src/app/api/reports/stale-products/route.ts`,
`src/app/api/reports/stock-turnover/route.ts`, `src/app/api/reports/export/route.ts`.
Add `const gate = await requireEntitlement("reports.advanced"); if (gate) return gate;`.
(Leave `src/app/api/analytics/*` ungated — those feed the Basic dashboard, key `reports.basic`.)

- [ ] **Step 10: Type-check + run full unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: compiles; existing tests still pass.

- [ ] **Step 11: Commit**

```bash
git add src/app/api
git commit -m "feat(entitlements): gate Pro+ API routes by tenant plan"
```

---

## Task 9: Seat limit at user creation

**Files:**
- Modify: `src/app/api/staff/route.ts` (the `POST` handler, around line 52)

> Seat-limit math is already unit-tested via `seatLimit()` in Task 1; this task wires the check into the route.

- [ ] **Step 1: Add the seat check before `prisma.user.create`**

In the `POST` handler, after the existing `requireAdmin()` auth (which establishes
tenant context) and input validation, before `prisma.user.create`:

```ts
import { currentPlan } from "@/lib/entitlements-guard";
import { seatLimit } from "@/lib/entitlements";
// ...inside POST, before creating the user:
const plan = (await currentPlan()) ?? "basic";
const limit = seatLimit(plan);
if (limit !== null) {
  const activeCount = await prisma.user.count({ where: { active: true } }); // auto-scoped to tenant
  if (activeCount >= limit) {
    return NextResponse.json(
      { success: false, error: "Limite de usuários do seu plano atingido", upgrade: true },
      { status: 403 },
    );
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification (after DB migration)**

As a Basic tenant (seat limit 1) with one active admin, attempt to create a second
user → expect 403 "Limite de usuários do seu plano atingido". As Enterprise → allowed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/staff/route.ts
git commit -m "feat(entitlements): enforce plan seat limit on user creation"
```

---

## Task 10: `/upgrade` upsell page

**Files:**
- Create: `src/app/upgrade/page.tsx`

> Self-serve checkout is C1 (billing). Here the upsell is a "contact us" CTA via WhatsApp, consistent with the sales landing.

- [ ] **Step 1: Create the page**

```tsx
// src/app/upgrade/page.tsx
import Link from "next/link";

const FEATURE_LABELS: Record<string, string> = {
  "fiscal.nfce": "Emissão de NFC-e",
  whatsapp: "Follow-up por WhatsApp",
  loyalty: "Fidelidade & cashback",
  vouchers: "Vale-presente & trocas",
  commissions: "Comissão de vendedores",
  deliveries: "Entregas",
  labels: "Etiquetas / código de barras",
  tables: "Mesas & comandas",
  "reports.advanced": "Relatórios avançados",
  multistore: "Multi-loja",
};

const WHATSAPP_URL = "https://wa.me/55999999999"; // TODO(business): replace with the real sales number

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  const label = feature ? FEATURE_LABELS[feature] ?? feature : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold">
        {label ? `${label} está disponível em um plano superior` : "Recurso disponível em um plano superior"}
      </h1>
      <p className="text-slate-600">
        Seu plano atual não inclui este recurso. Fale com a gente para liberar e
        aproveitar tudo que o PDV ZapFlow oferece.
      </p>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-brand-green px-6 py-3 font-semibold text-white"
      >
        Falar no WhatsApp
      </a>
      <Link href="/" className="text-sm text-slate-500 underline">
        Voltar ao início
      </Link>
    </main>
  );
}
```

> Note: `WHATSAPP_URL` placeholder mirrors the landing's `55999999999`. Swapping in the
> real number is a known business follow-up tracked for the landing too — not a blocker.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/upgrade/page.tsx
git commit -m "feat(entitlements): /upgrade upsell page"
```

---

## Task 11: `create-tenant` CLI — plan support

**Files:**
- Modify: `scripts/create-tenant.ts`

- [ ] **Step 1: Accept and validate a `--plan` flag**

In `scripts/create-tenant.ts`, after reading the other args, add:

```ts
import { PLANS } from "../src/lib/entitlements";
// ...
  const planArg = (arg("--plan") ?? "basic").toLowerCase();
  if (!(PLANS as readonly string[]).includes(planArg)) {
    console.error(`Invalid --plan "${planArg}". Use one of: ${PLANS.join(", ")}`);
    process.exit(1);
  }
  const plan = planArg as (typeof PLANS)[number];
```

Then pass it into the create call:

```ts
  const tenant = await prisma.tenant.create({ data: { name, slug, plan } });
```

Update the usage comment at the top to include `--plan <basic|pro|enterprise>`.

- [ ] **Step 2: Verify the script type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors. (Do NOT run the script against the shared prod DB here.)

- [ ] **Step 3: Commit**

```bash
git add scripts/create-tenant.ts
git commit -m "feat(entitlements): create-tenant accepts --plan"
```

---

## Task 12: Rollout — DB migration (operational, coordinate with deploy)

> ⚠️ **Shared prod=dev Supabase DB.** Order matters: backfill the live tenant to
> `enterprise` BEFORE the gating code ships, or fail-closed (`null → basic`) instantly
> downgrades the live shop. DDL needs the **session-mode pooler** (port **5432**, drop
> `pgbouncer=true` from the URL), per repo convention.

- [ ] **Step 1: Backfill the live tenant's plan (while column is still text-compatible)**

Run (session-pooler `DATABASE_URL`):

```bash
npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
UPDATE tenants SET plan = 'enterprise' WHERE slug = 'loja-principal';
SQL
```

Verify exactly one row updated.

- [ ] **Step 2: Push the enum schema to the DB**

Run (session-mode pooler URL, port 5432, no `pgbouncer=true`):

```bash
npx prisma db push
```

Expected: `tenants.plan` becomes the `Plan` enum type; existing value `enterprise`
casts cleanly; any nulls remain null.

- [ ] **Step 3: Verify**

```bash
npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
SELECT slug, plan FROM tenants;
SQL
```

Expected: `loja-principal → enterprise`. Confirm any other tenants have the intended plan.

- [ ] **Step 4: Smoke test (after deploy)**

Log in as the live tenant's admin → confirm all modules unlocked (Enterprise) and no
nav item shows a lock. Create a product, open `/fiscal`, `/reports` — no `/upgrade` redirect.

---

## Task 13: Final verification

- [ ] **Step 1: Full suite + type-check + build**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: unit tests pass (including the new entitlements + guard suites); types clean;
build green (or green except the known `SESSION_SECRET` page-data env caveat — in which
case `tsc --noEmit` passing is the gate).

- [ ] **Step 2: (Optional) e2e**

If adding an e2e (`tests/e2e/entitlements.spec.ts`): seed/point at a Basic tenant,
assert a locked nav item exists and that visiting `/fiscal` redirects to `/upgrade`;
point at an Enterprise tenant, assert no locks. Run: `npm run test:e2e`.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/entitlements
gh pr create --title "feat: plan entitlements layer (gating)" --body "Implements docs/superpowers/specs/2026-06-29-entitlements-layer-design.md. Gates modules by tenant plan at API, UI, and seat layers. DB migration (Task 12) must run with deploy: backfill loja-principal → enterprise BEFORE merge."
```
