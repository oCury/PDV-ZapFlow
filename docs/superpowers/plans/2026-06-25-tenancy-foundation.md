# Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert PDV-ZapFlow from an implicit single store into a row-scoped multi-tenant app where every query is automatically isolated to the logged-in user's tenant, preserving the live store as Tenant #1.

**Architecture:** A request-scoped `AsyncLocalStorage` holds the current `tenantId`. A Prisma client extension (`$allModels.$allOperations`) injects `tenant_id` into every read/write for the 26 tenant-owned models, failing closed (throws) if no tenant context is set. Auth helpers set the context as a side effect of the existing session check, so the ~73 existing `import { prisma }` call sites need no change. The existing store is migrated to Tenant #1 via an additive nullable → backfill → NOT NULL sequence on the shared Supabase DB.

**Tech Stack:** Next.js 15 (App Router), Prisma 6 + PostgreSQL (Supabase), Vitest, custom signed-cookie auth, `node:async_hooks`.

**Spec:** `docs/superpowers/specs/2026-06-25-tenancy-foundation-design.md`

---

## Important context for the implementer

- **prod = dev share ONE Supabase database.** There is no staging. Every `prisma db push` against `DATABASE_URL` mutates production. All schema changes here are **additive**; the only destructive-looking step (NOT NULL) runs *after* backfill so it is safe. **Never point the test suite at `DATABASE_URL`.**
- **The project uses `prisma db push`, not migrations** (there is no `prisma/migrations/` dir). Do not introduce `prisma migrate`.
- **Tests are DB-free.** Existing tests use `vi.mock`. All tasks below are unit-testable without a database except the clearly-marked optional integration test (Task 11), which requires a disposable local Postgres via `TEST_DATABASE_URL`.
- **Decision (supersedes spec wording):** `tenant_id` is added as a **plain scalar column + `@@index`** on the 26 tenant-owned models — **no Prisma relation field** (avoids 26 back-relations on `Tenant`; row-scoping does not need FK navigation; tenant deletion is not a flow). Only `MpConnection` keeps a real relation to `Tenant`.
- **Decision (supersedes spec wording):** Because Prisma 6 accepts non-unique fields in `findUnique`/`update`/`delete` `where`, the extension injects `tenant_id` directly. The only call sites that must change are those that `findUnique`/`upsert` **on a field that becomes a composite unique** (e.g. `barcode`, `key`) — TypeScript flags these (Task 9).
- **Out-of-request / background callers.** Any code that uses the scoped `prisma` outside a request (a cron route, a queue worker like `followup-service`/`FiscalService` if triggered without a user session) will throw `No tenant context` (fail-closed) until it establishes one. A per-user cron should call `requireTenant()`; a cron that processes **all** tenants must loop `await basePrisma.tenant.findMany()` and wrap each tenant's work in `runWithTenant(tenant.id, ...)`. Provisioning/backfill scripts sidestep this entirely by using the raw `PrismaClient` and passing `tenant_id` explicitly. Confirm during the Task 12 audit whether any such caller exists.

### Pre-flight (run once before Task 1, inside the worktree)

- [ ] Confirm starting state

Run: `cd <worktree> && git status -s && npx vitest run 2>&1 | tail -5`
Expected: clean tree; existing tests pass.

---

## Task 1: Tenant context (AsyncLocalStorage)

**Files:**
- Create: `src/lib/tenant/context.ts`
- Test: `src/lib/tenant/context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tenant/context.test.ts
import { describe, it, expect } from "vitest";
import { runWithTenant, enterTenant, getTenantId, getTenantIdOrNull } from "./context";

describe("tenant context", () => {
  it("returns the tenant id inside runWithTenant", () => {
    expect(runWithTenant("t1", () => getTenantId())).toBe("t1");
  });

  it("throws when getTenantId runs with no context", () => {
    expect(() => getTenantId()).toThrow(/No tenant context/);
  });

  it("getTenantIdOrNull returns null with no context", () => {
    expect(getTenantIdOrNull()).toBeNull();
  });

  it("enterTenant overrides within a context and does not leak outside it", () => {
    const inside = runWithTenant("a", () => {
      enterTenant("b");
      return getTenantId();
    });
    expect(inside).toBe("b");
    expect(getTenantIdOrNull()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tenant/context.test.ts`
Expected: FAIL — cannot find module `./context`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/tenant/context.ts
import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantStore {
  tenantId: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Run `fn` with the tenant context bound for its whole async subtree. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

/** Bind the tenant context for the rest of the current async execution (request handler). */
export function enterTenant(tenantId: string): void {
  tenantStorage.enterWith({ tenantId });
}

/** Current tenant id. Throws (fail-closed) if no context is set. */
export function getTenantId(): string {
  const store = tenantStorage.getStore();
  if (!store?.tenantId) {
    throw new Error(
      "No tenant context: a tenant-scoped query ran outside requireTenant()/runWithTenant()."
    );
  }
  return store.tenantId;
}

/** Current tenant id or null — for the rare deliberately-unscoped path. */
export function getTenantIdOrNull(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tenant/context.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant/context.ts src/lib/tenant/context.test.ts
git commit -m "feat: request-scoped tenant context (AsyncLocalStorage)"
```

---

## Task 2: Tenant scope function (pure)

**Files:**
- Create: `src/lib/tenant/scope.ts`
- Test: `src/lib/tenant/scope.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tenant/scope.test.ts
import { describe, it, expect } from "vitest";
import { applyTenantScope, TENANT_MODELS } from "./scope";

const T = "tenant_1";

describe("applyTenantScope", () => {
  it("stamps tenant_id on create.data", () => {
    const out = applyTenantScope("create", { data: { name: "x" } }, T);
    expect(out.data).toEqual({ name: "x", tenant_id: T });
  });

  it("stamps tenant_id on every row of createMany", () => {
    const out = applyTenantScope("createMany", { data: [{ a: 1 }, { a: 2 }] }, T);
    expect(out.data).toEqual([{ a: 1, tenant_id: T }, { a: 2, tenant_id: T }]);
  });

  it("injects tenant_id into where on findMany", () => {
    const out = applyTenantScope("findMany", { where: { active: true } }, T);
    expect(out.where).toEqual({ active: true, tenant_id: T });
  });

  it("injects tenant_id into where on findUnique (Prisma 6 allows extra filters)", () => {
    const out = applyTenantScope("findUnique", { where: { id: "p1" } }, T);
    expect(out.where).toEqual({ id: "p1", tenant_id: T });
  });

  it("injects tenant_id into where on update and delete", () => {
    expect(applyTenantScope("update", { where: { id: "p1" }, data: {} }, T).where)
      .toEqual({ id: "p1", tenant_id: T });
    expect(applyTenantScope("delete", { where: { id: "p1" } }, T).where)
      .toEqual({ id: "p1", tenant_id: T });
  });

  it("scopes both where and create on upsert", () => {
    const out = applyTenantScope("upsert", { where: { id: "p1" }, create: { a: 1 }, update: {} }, T);
    expect(out.where).toEqual({ id: "p1", tenant_id: T });
    expect(out.create).toEqual({ a: 1, tenant_id: T });
  });

  it("does not mutate the original args object", () => {
    const args = { where: { active: true } };
    applyTenantScope("findMany", args, T);
    expect(args.where).toEqual({ active: true });
  });

  it("knows the full set of tenant-owned models (26)", () => {
    expect(TENANT_MODELS.size).toBe(26);
    expect(TENANT_MODELS.has("Product")).toBe(true);
    expect(TENANT_MODELS.has("Tenant")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tenant/scope.test.ts`
Expected: FAIL — cannot find module `./scope`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/tenant/scope.ts

/** Prisma model names (the `model` value in $allModels) that are tenant-owned. */
export const TENANT_MODELS = new Set<string>([
  "User", "Category", "Product", "ProductVariant", "Customer", "Table",
  "Sale", "SalePayment", "PaymentTerminal", "TerminalCharge",
  "CashRegisterShift", "SaleItem", "CustomerFollowup", "StoreSettings",
  "CommissionRule", "CommissionCategoryRule", "CommissionTier", "SalesGoal",
  "FiscalQueue", "FiscalEvent", "FiscalSequence", "Exchange", "ExchangeItem",
  "Voucher", "VoucherUsage", "Delivery",
]);

type AnyArgs = Record<string, unknown>;

/**
 * Returns a shallow copy of `args` with tenant_id enforced for `operation`.
 * Pure — no DB access. Prisma 6 accepts non-unique fields in unique-where ops,
 * so tenant_id is injected directly into `where` for find/update/delete-by-id.
 */
export function applyTenantScope(operation: string, args: AnyArgs, tenantId: string): AnyArgs {
  const next: AnyArgs = { ...(args ?? {}) };
  const withTenantWhere = () => {
    next.where = { ...((next.where as AnyArgs) ?? {}), tenant_id: tenantId };
  };

  switch (operation) {
    case "create":
      next.data = { ...((next.data as AnyArgs) ?? {}), tenant_id: tenantId };
      break;
    case "createMany":
    case "createManyAndReturn":
      next.data = Array.isArray(next.data)
        ? (next.data as AnyArgs[]).map((d) => ({ ...d, tenant_id: tenantId }))
        : { ...((next.data as AnyArgs) ?? {}), tenant_id: tenantId };
      break;
    case "upsert":
      withTenantWhere();
      next.create = { ...((next.create as AnyArgs) ?? {}), tenant_id: tenantId };
      break;
    case "findUnique":
    case "findUniqueOrThrow":
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
    case "delete":
    case "deleteMany":
    case "count":
    case "aggregate":
    case "groupBy":
      withTenantWhere();
      break;
    default:
      break; // unknown op: leave unchanged
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tenant/scope.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant/scope.ts src/lib/tenant/scope.test.ts
git commit -m "feat: pure tenant-scope arg transformer for Prisma ops"
```

---

## Task 3: Wire the extension into the Prisma client

**Files:**
- Modify: `src/lib/prisma.ts` (replace whole file)

No new behavioral test — the transformation logic is covered by Task 2; this task is wiring verified by `tsc`. Keeps `import { prisma }` working everywhere and adds `basePrisma`.

- [ ] **Step 1: Replace `src/lib/prisma.ts`**

```ts
// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { getTenantId } from "./tenant/context";
import { applyTenantScope, TENANT_MODELS } from "./tenant/scope";

/**
 * Supabase/PgBouncer pool (port 6543) does not support prepared statements.
 * Prisma needs pgbouncer=true to disable them.
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return url;
  if (url.includes("6543") && !url.includes("pgbouncer=true")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}pgbouncer=true`;
  }
  return url;
}

function makeTenantPrisma(client: PrismaClient) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const scoped = applyTenantScope(
            operation,
            (args ?? {}) as Record<string, unknown>,
            getTenantId()
          );
          return query(scoped);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  basePrisma?: PrismaClient;
  prisma?: ReturnType<typeof makeTenantPrisma>;
};

/** Raw, UNSCOPED client. Only for login, provisioning scripts, and the backfill. */
export const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({ datasources: { db: { url: getDatabaseUrl() } } });

/** Tenant-scoped client. The default for all feature code (auto-injects tenant_id). */
export const prisma = globalForPrisma.prisma ?? makeTenantPrisma(basePrisma);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.basePrisma = basePrisma;
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `prisma.ts`. If `$allOperations` types complain, confirm `@prisma/client` v6 (`npx prisma -v`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/prisma.ts
git commit -m "feat: tenant-scoped Prisma client extension; export basePrisma"
```

---

## Task 4: Schema — additive nullable `tenant_id` + new models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the two new models** (after the `datasource` block)

```prisma
model Tenant {
  id            String        @id @default(cuid())
  name          String
  slug          String        @unique
  plan          String?
  active        Boolean       @default(true)
  created_at    DateTime      @default(now())
  updated_at    DateTime      @updatedAt
  mp_connection MpConnection?

  @@map("tenants")
}

model MpConnection {
  id                      String    @id @default(cuid())
  tenant_id               String    @unique
  mp_user_id              String
  access_token            String
  refresh_token           String
  public_key              String?
  scope                   String?
  token_type              String?
  live_mode               Boolean   @default(false)
  access_token_expires_at DateTime?
  created_at              DateTime  @default(now())
  updated_at              DateTime  @updatedAt
  tenant                  Tenant    @relation(fields: [tenant_id], references: [id])

  @@index([mp_user_id])
  @@map("mp_connections")
}
```

- [ ] **Step 2: Add a nullable `tenant_id` scalar + index to all 26 tenant-owned models**

For EACH model below, add `tenant_id String?` (right after its `id` field) and add `@@index([tenant_id])` to its index block. Do **not** add a relation field. Leave every existing `@unique`/`@@unique` exactly as-is (they change in Task 6).

Models: `User`, `Category`, `Product`, `ProductVariant`, `Customer`, `Table`, `Sale`, `SalePayment`, `PaymentTerminal`, `TerminalCharge`, `CashRegisterShift`, `SaleItem`, `CustomerFollowup`, `StoreSettings`, `CommissionRule`, `CommissionCategoryRule`, `CommissionTier`, `SalesGoal`, `FiscalQueue`, `FiscalEvent`, `FiscalSequence`, `Exchange`, `ExchangeItem`, `Voucher`, `VoucherUsage`, `Delivery`.

Example (User):

```prisma
model User {
  id         String   @id @default(cuid())
  tenant_id  String?
  // ...existing fields unchanged...

  @@index([tenant_id])
  @@map("users")
}
```

- [ ] **Step 3: Generate + validate**

Run: `npx prisma generate && npx prisma validate`
Expected: "The schema is valid" and client generated.

- [ ] **Step 4: Push the additive change**

Run: `npx prisma db push`
Expected: "Your database is now in sync..." with only **additive** changes (new tables, new nullable columns, new indexes). **If `db push` reports any DROP or data loss, STOP — it must be additive only.**

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Tenant + MpConnection models and nullable tenant_id (additive)"
```

---

## Task 5: Backfill script — create Tenant #1 and assign all rows

**Files:**
- Create: `scripts/backfill-tenant.ts`
- Modify: `package.json` (add `tenant:backfill` + `tenant:create` scripts)

- [ ] **Step 1: Add npm scripts** to `package.json` `"scripts"` (mirror the seed invocation)

```json
"tenant:backfill": "ts-node --compiler-options {\"module\":\"CommonJS\"} scripts/backfill-tenant.ts",
"tenant:create": "ts-node --compiler-options {\"module\":\"CommonJS\"} scripts/create-tenant.ts"
```

- [ ] **Step 2: Write the backfill script**

```ts
// scripts/backfill-tenant.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_1 = {
  name: process.env.TENANT1_NAME ?? "Loja Principal",
  slug: process.env.TENANT1_SLUG ?? "loja-principal",
};

// Prisma model accessors (camelCase) that own a tenant_id column.
const MODELS = [
  "user", "category", "product", "productVariant", "customer", "table",
  "sale", "salePayment", "paymentTerminal", "terminalCharge",
  "cashRegisterShift", "saleItem", "customerFollowup", "storeSettings",
  "commissionRule", "commissionCategoryRule", "commissionTier", "salesGoal",
  "fiscalQueue", "fiscalEvent", "fiscalSequence", "exchange", "exchangeItem",
  "voucher", "voucherUsage", "delivery",
] as const;

async function main() {
  console.log("Backfill: ensuring Tenant #1 exists...");
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_1.slug },
    update: {},
    create: { name: TENANT_1.name, slug: TENANT_1.slug },
  });
  console.log(`  ✓ Tenant #1 = ${tenant.id} (${tenant.slug})`);

  for (const model of MODELS) {
    // @ts-expect-error dynamic model access by name
    const res = await prisma[model].updateMany({
      where: { tenant_id: null },
      data: { tenant_id: tenant.id },
    });
    console.log(`  ✓ ${model}: ${res.count} rows assigned`);
  }
  console.log("Backfill complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 3: Run the backfill**

Run: `npm run tenant:backfill`
Expected: prints Tenant #1 id then `✓ <model>: N rows assigned` for all 26 models. Idempotent — re-running assigns `0 rows`.

- [ ] **Step 4: Verify no orphan rows** (spot-check big tables)

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT 'products' AS t, count(*) FROM products WHERE tenant_id IS NULL
UNION ALL SELECT 'sales', count(*) FROM sales WHERE tenant_id IS NULL
UNION ALL SELECT 'users', count(*) FROM users WHERE tenant_id IS NULL;
SQL
```
Expected: every count is `0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-tenant.ts package.json
git commit -m "feat: backfill script assigns existing rows to Tenant #1"
```

---

## Task 6: Schema — enforce NOT NULL + per-tenant composite uniques

**Files:**
- Modify: `prisma/schema.prisma`

Safe now: every row has a `tenant_id` (Task 5) and all share Tenant #1, so composite uniques cannot collide.

- [ ] **Step 1: Make `tenant_id` NOT NULL** — change `tenant_id String?` → `tenant_id String` in all 26 models.

- [ ] **Step 2: Convert global uniques to per-tenant composite** — apply exactly these:

| Model | Change field | Add |
|---|---|---|
| `Category` | `slug String @unique` → `slug String` | `@@unique([tenant_id, slug])` |
| `Product` | `barcode String @unique` → `barcode String` | `@@unique([tenant_id, barcode])` |
| `ProductVariant` | `sku String @unique` → `sku String` | `@@unique([tenant_id, sku])` |
| `ProductVariant` | `barcode String? @unique` → `barcode String?` | `@@unique([tenant_id, barcode])` |
| `Customer` | `email String? @unique` → `email String?` | `@@unique([tenant_id, email])` |
| `Customer` | `phone String @unique` → `phone String` | `@@unique([tenant_id, phone])` |
| `Customer` | `cpf String? @unique` → `cpf String?` | `@@unique([tenant_id, cpf])` |
| `Table` | `number Int @unique` → `number Int` | `@@unique([tenant_id, number])` |
| `StoreSettings` | `key String @unique` → `key String` | `@@unique([tenant_id, key])` |
| `Voucher` | `code String @unique` → `code String` | `@@unique([tenant_id, code])` |
| `FiscalSequence` | `@@unique([series])` → remove | `@@unique([tenant_id, series])` |
| `PaymentTerminal` | `mp_device_id String @unique` → `mp_device_id String` | `@@unique([tenant_id, mp_device_id])` |
| `TerminalCharge` | `mp_order_id String @unique` → `mp_order_id String` | `@@unique([tenant_id, mp_order_id])` |

> **Leave `User.email @unique` GLOBAL** (deliberate exception — keeps login tenant-picker-free).
> Leave `CustomerFollowup.sale_id`, `FiscalQueue.sale_id`, `Delivery.sale_id` as `@unique`.
> Leave `CommissionCategoryRule @@unique([commission_rule_id, category_id])` unchanged.

- [ ] **Step 3: Validate + generate**

Run: `npx prisma validate && npx prisma generate`
Expected: schema valid, client regenerated.

- [ ] **Step 4: Push to the database**

Run: `npx prisma db push`
Expected: columns altered to NOT NULL and unique indexes swapped, **no row loss**. If it reports a unique-constraint violation, a tenant has duplicate values — STOP and investigate (should be impossible with a single Tenant #1).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: enforce NOT NULL tenant_id and per-tenant composite uniques"
```

---

## Task 7: Auth/session — carry `tenantId` and bind context

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth-edge.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Test: `src/lib/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret";
});

describe("session token carries tenantId", () => {
  it("round-trips tenantId through create/parse", async () => {
    const { createSessionToken, parseSessionToken } = await import("./auth");
    const token = createSessionToken({ userId: "u1", role: "ADMIN", name: "A", tenantId: "t1" });
    expect(parseSessionToken(token)).toMatchObject({ userId: "u1", tenantId: "t1" });
  });

  it("rejects a tampered token", async () => {
    const { createSessionToken, parseSessionToken } = await import("./auth");
    const token = createSessionToken({ userId: "u1", role: "ADMIN", name: "A", tenantId: "t1" });
    expect(parseSessionToken(token + "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: FAIL — `tenantId` missing from `SessionPayload` (tsc) or from the parsed object.

- [ ] **Step 3: Update `src/lib/auth.ts`** — extend the type, swap to `basePrisma`, bind context, add `requireTenant`. Add these imports at the top:

```ts
import { enterTenant } from "./tenant/context";
import { basePrisma } from "./prisma";
```

Change the interface:

```ts
interface SessionPayload {
  userId: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  tenantId: string;
}
```

Replace `getSessionUser` + `requireAdmin` and append `requireTenant`:

```ts
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
```

- [ ] **Step 4: Update `src/lib/auth-edge.ts`** — add `tenantId` to its `SessionPayload` (type parity; logic unchanged):

```ts
interface SessionPayload {
  userId: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  tenantId: string;
}
```

- [ ] **Step 5: Update the login route** `src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha são obrigatórios." }, { status: 400 });
    }

    const user = await basePrisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json({ error: "Email ou senha inválidos." }, { status: 401 });
    }
    if (!user.active) {
      return NextResponse.json({ error: "Conta desativada. Contate o administrador." }, { status: 403 });
    }
    if (!user.tenant_id) {
      return NextResponse.json({ error: "Usuário sem loja associada." }, { status: 403 });
    }

    await setSessionCookie({
      userId: user.id,
      role: user.role,
      name: user.name,
      tenantId: user.tenant_id,
    });

    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
  } catch (error: unknown) {
    console.error("[Auth Login] Internal error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Erro interno ao processar login." }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/auth-edge.ts src/app/api/auth/login/route.ts src/lib/auth.test.ts
git commit -m "feat: carry tenantId in session and bind tenant context on auth"
```

---

## Task 8: Provisioning script — `create-tenant.ts`

**Files:**
- Create: `scripts/create-tenant.ts`

(`tenant:create` npm script was added in Task 5 Step 1.)

- [ ] **Step 1: Write the script**

```ts
// scripts/create-tenant.ts
// Usage: npm run tenant:create -- --name "Loja X" --slug loja-x --email admin@lojax.com --password secret123
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("--name");
  const slug = arg("--slug");
  const email = arg("--email")?.toLowerCase().trim();
  const password = arg("--password");

  if (!name || !slug || !email || !password) {
    console.error("Required: --name <name> --slug <slug> --email <email> --password <password>");
    process.exit(1);
  }

  const tenant = await prisma.tenant.create({ data: { name, slug } });
  const user = await prisma.user.create({
    data: {
      name: "Administrador",
      email,
      password: hashPassword(password),
      role: "ADMIN",
      tenant_id: tenant.id,
    },
  });

  console.log(`✓ Tenant ${tenant.slug} (${tenant.id})`);
  console.log(`✓ Admin ${user.email} (${user.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Smoke-test a second tenant**

Run: `npm run tenant:create -- --name "Loja Teste" --slug loja-teste --email admin@lojateste.com --password teste123`
Expected: prints `✓ Tenant loja-teste ...` and `✓ Admin admin@lojateste.com ...`. (Optionally remove it later via `npx prisma studio`.)

- [ ] **Step 3: Commit**

```bash
git add scripts/create-tenant.ts
git commit -m "feat: create-tenant provisioning script (tenant + first admin)"
```

---

## Task 9: Convert composite-unique call sites + tenant-scope `settings.ts`

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `prisma/seed.ts`
- Modify: any other site flagged by `tsc`

After Task 6, `findUnique`/`upsert` on a now-composite-unique field no longer compiles. Find and fix.

- [ ] **Step 1: Find the broken call sites**

Run: `npx tsc --noEmit 2>&1 | grep -E "where|Unique|tenant_id" | head -40`
Expected: a list of TS errors including `src/lib/settings.ts` (by `key`) and `prisma/seed.ts` (by `barcode`).

- [ ] **Step 2: Fix `src/lib/settings.ts`** — `getSetting` → `findFirst`; `setSetting` → composite-unique `upsert` (runs in request context, so `getTenantId()` is available):

```ts
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant/context";

const DEFAULTS: Record<string, string> = {
  followup_days: "15",
  cashback_percent: "10",
  store_name: "Sua Loja",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.storeSettings.findFirst({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function getNumericSetting(key: string): Promise<number> {
  const value = await getSetting(key);
  const num = parseFloat(value);
  return isNaN(num) ? parseFloat(DEFAULTS[key] ?? "0") : num;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const tenant_id = getTenantId();
  await prisma.storeSettings.upsert({
    where: { tenant_id_key: { tenant_id, key } },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.storeSettings.findMany();
  const stored: Record<string, string> = {};
  for (const row of rows) stored[row.key] = row.value;
  return { ...DEFAULTS, ...stored };
}
```

> The composite-unique input name `tenant_id_key` is what Prisma derives from `@@unique([tenant_id, key])`. If `tsc` reports a different generated name, use that.

- [ ] **Step 3: Fix `prisma/seed.ts`** — it uses its own raw `PrismaClient`, so pass `tenant_id` explicitly. Near the top of `main()`:

```ts
const tenant = await prisma.tenant.upsert({
  where: { slug: "loja-principal" },
  update: {},
  create: { name: "Loja Principal", slug: "loja-principal" },
});
```

Then in the admin-user create add `tenant_id: tenant.id` to its `data`, and change the product upsert to:

```ts
await prisma.product.upsert({
  where: { tenant_id_barcode: { tenant_id: tenant.id, barcode: product.barcode } },
  update: {
    name: product.name,
    cost_price: product.cost_price,
    sell_price: product.sell_price,
    stock_quantity: product.stock_quantity,
    category: product.category,
    image_url: product.image_url,
  },
  create: { ...product, tenant_id: tenant.id },
});
```

- [ ] **Step 4: Fix any remaining `tsc` errors** the same way — `findUnique` by a now-non-unique field → `findFirst`; an `upsert`/`findUnique` that must key uniquely → the generated `tenant_id_<field>` composite input.

- [ ] **Step 5: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; Next build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings.ts prisma/seed.ts
git commit -m "fix: scope settings + seed to tenant; resolve composite-unique call sites"
```

---

## Task 10: Cross-tenant isolation test suite (extension-level, DB-free)

**Files:**
- Create: `src/lib/tenant/isolation.test.ts`

Proves the real Prisma extension enforces `tenant_id` for each operation category, using a stubbed engine (`query` is never called) — no database connection.

- [ ] **Step 1: Write the test**

```ts
// src/lib/tenant/isolation.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runWithTenant, getTenantId } from "./context";
import { applyTenantScope, TENANT_MODELS } from "./scope";

// Mirror the extension wiring from src/lib/prisma.ts, capturing the args the
// engine WOULD receive. query() is never called, so no DB connection opens.
function makeProbe() {
  const calls: { model?: string; operation: string; args: unknown }[] = [];
  const client = new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          if (!model || !TENANT_MODELS.has(model)) {
            calls.push({ model, operation, args });
            return [] as unknown;
          }
          const scoped = applyTenantScope(operation, (args ?? {}) as Record<string, unknown>, getTenantId());
          calls.push({ model, operation, args: scoped });
          return [] as unknown;
        },
      },
    },
  });
  return { client, calls, last: () => calls.at(-1)! };
}

describe("cross-tenant isolation (extension enforces tenant_id)", () => {
  let probe: ReturnType<typeof makeProbe>;
  beforeEach(() => { probe = makeProbe(); });

  it("findMany on Product is scoped to the caller's tenant", async () => {
    await runWithTenant("tenantA", () => probe.client.product.findMany({ where: { name: "x" } }));
    expect((probe.last().args as { where: unknown }).where).toEqual({ name: "x", tenant_id: "tenantA" });
  });

  it("update on Sale is scoped (cannot touch another tenant's row)", async () => {
    await runWithTenant("tenantA", () =>
      probe.client.sale.update({ where: { id: "s_from_B" }, data: { notes: "z" } }));
    expect((probe.last().args as { where: unknown }).where).toEqual({ id: "s_from_B", tenant_id: "tenantA" });
  });

  it("delete on Customer is scoped", async () => {
    await runWithTenant("tenantA", () => probe.client.customer.delete({ where: { id: "c_B" } }));
    expect((probe.last().args as { where: unknown }).where).toEqual({ id: "c_B", tenant_id: "tenantA" });
  });

  it("create on Voucher stamps the tenant", async () => {
    await runWithTenant("tenantA", () =>
      probe.client.voucher.create({ data: { code: "V1" } as never }));
    expect((probe.last().args as { data: unknown }).data).toMatchObject({ tenant_id: "tenantA" });
  });

  it("a scoped query with NO tenant context throws (fail-closed)", async () => {
    await expect(probe.client.storeSettings.findMany()).rejects.toThrow(/No tenant context/);
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `npx vitest run src/lib/tenant/isolation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Run the full unit suite**

Run: `npx vitest run`
Expected: all tests pass (new tenant tests + pre-existing tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/tenant/isolation.test.ts
git commit -m "test: cross-tenant isolation enforced by Prisma extension"
```

---

## Task 11: (Optional) DB-backed integration smoke test

Only with a **disposable** local Postgres. **Never** use the Supabase `DATABASE_URL`.

**Files:**
- Create: `src/lib/tenant/isolation.integration.test.ts`

- [ ] **Step 1: Write a guarded integration test**

```ts
// src/lib/tenant/isolation.integration.test.ts
import { describe, it, expect } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const maybe = TEST_URL ? describe : describe.skip;

maybe("tenant isolation against a real DB", () => {
  it("tenant A cannot read tenant B's products", async () => {
    process.env.DATABASE_URL = TEST_URL;
    const { prisma, basePrisma } = await import("@/lib/prisma");
    const { runWithTenant } = await import("./context");

    const a = await basePrisma.tenant.create({ data: { name: "A", slug: `a-${Date.now()}` } });
    const b = await basePrisma.tenant.create({ data: { name: "B", slug: `b-${Date.now()}` } });
    await basePrisma.product.create({
      data: { name: "B-only", barcode: `bb-${Date.now()}`, cost_price: 1, sell_price: 2,
        category: "x", tenant_id: b.id },
    });

    const seenByA = await runWithTenant(a.id, () => prisma.product.findMany());
    expect(seenByA.find((p) => p.name === "B-only")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it (only with a test DB)**

Run:
```bash
TEST_DATABASE_URL=postgresql://localhost:5432/pdv_test npx prisma db push
TEST_DATABASE_URL=postgresql://localhost:5432/pdv_test npx vitest run src/lib/tenant/isolation.integration.test.ts
```
Expected: PASS, or SKIPPED if `TEST_DATABASE_URL` is unset.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tenant/isolation.integration.test.ts
git commit -m "test: optional DB-backed tenant isolation smoke test"
```

---

## Task 12: Route audit + final verification

**Files:**
- Modify: any API route / server action that queries `prisma` without first calling an auth helper.

- [ ] **Step 1: Find routes that query `prisma` without establishing context**

Run: `grep -rL "getSessionUser\|requireAdmin\|requireTenant" src/app/api --include='route.ts' | xargs grep -l "@/lib/prisma" 2>/dev/null`
Expected: a (hopefully short) list. For each, add near the top:

```ts
import { requireTenant } from "@/lib/auth";
// ...
const t = await requireTenant();
if (!t) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

Routes that legitimately need no tenant (e.g. the MP webhook — sub-project B) should use `basePrisma` deliberately; note them but do not change here.

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: types clean, all tests pass, production build succeeds.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: ensure all tenant-scoped routes establish tenant context"
```

---

## Done criteria

- All 26 tenant-owned tables have a NOT NULL `tenant_id`; existing data lives under Tenant #1.
- Every read/write through `prisma` is auto-scoped; a scoped op with no context throws.
- Login resolves the user's tenant and binds it to the session; one-tenant-per-login.
- `npm run tenant:create` provisions a new loja + admin; a second tenant cannot see Tenant #1's data (isolation tests green).
- `npx tsc --noEmit`, `npx vitest run`, and `npm run build` all pass.
- **Out of scope (sub-project B):** wiring `MpConnection` to MP OAuth, token encryption/refresh, per-tenant Point calls.
