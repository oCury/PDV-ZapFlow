# Tenancy Foundation (Sub-project A) — Design Spec

**Date:** 2026-06-25
**Repo:** PDV-ZapFlow
**Roadmap:** `docs/superpowers/plans/2026-06-25-multitenancy-mp-connect-roadmap.md`
**Scope stub:** `docs/superpowers/specs/2026-06-25-multitenancy-mp-connect-scope.md`
**Status:** Approved design — ready for implementation plan.

> This is **sub-project A** of the multi-tenancy + Mercado Pago Connect roadmap.
> It builds the tenancy foundation only. **Sub-project B** (MP OAuth/Connect wiring)
> is a separate spec → plan → build cycle and is explicitly out of scope here.

## Goal

Convert PDV-ZapFlow from an implicit single-store app into a **multi-tenant SaaS** where
many lojas share one deploy and one database with **row-level data isolation**. Each user
logs into exactly one tenant; all data reads/writes are automatically scoped to that tenant.
The existing live store is preserved by migrating it into **Tenant #1**.

## Phase 0 decisions (locked)

| Decision | Choice |
|---|---|
| Isolation | Shared schema + `tenant_id` row scoping (one DB, one deploy) |
| Tenant model | `Tenant` (identity) + `MpConnection` (per-tenant MP creds, 1:1) |
| Query scoping | Prisma client extension + request-scoped tenant context (AsyncLocalStorage) — **Approach 1** |
| Auth | Add `tenant_id` to session payload; login resolves tenant from the user |
| Provisioning | **Andre creates tenants** via a seed/CLI script. One-tenant-per-login, **no cross-tenant/god-mode** access |
| MP creds | MP OAuth/Connect, tokens stored **encrypted** (AES-GCM, env key) — *wired in sub-project B* |
| Migration | Create Tenant #1, backfill `tenant_id` on all existing rows, then enforce NOT NULL |

## MP Connect research (informs `MpConnection`; full wiring is sub-project B)

Verified against official MP docs (Brasil):
- **OAuth / "MP Connect" (Marketplace mode)** is the correct model: one registered integrator
  app; each client authorizes it once and we receive a per-seller token keyed by `user_id`.
- This **resolves the "Integrator isn't registered" 403** ("Configuração do Mercado Pago
  inválida") at the **app level, one-time** — clients no longer need their own MP app.
- Authorize: `GET https://auth.mercadopago.com/authorization`. Token + refresh:
  `POST https://api.mercadopago.com/oauth/token`. Scopes: `read write offline_access`.
- Access token lives **180 days**; the **refresh token rotates on every use** → always persist
  the latest one returned.
- **Open risk for sub-project B (confirm with MP commercial before B ships):** the docs imply a
  Point-*integrator enablement* step that is not self-serve-documented. Two per-client runtime
  conditions also remain: the terminal must be paired to that client's MP account, and every
  Point call must use that client's token. **None of this blocks sub-project A.**

## 1. Data model

### New models

```prisma
model Tenant {
  id         String   @id @default(cuid())
  name       String
  slug       String   @unique          // globally unique tenant handle
  plan       String?                    // free-form for now (billing tie-in later)
  active     Boolean  @default(true)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  // back-relations to every tenant-owned model + mp_connection
  @@map("tenants")
}

model MpConnection {
  id                       String   @id @default(cuid())
  tenant_id                String   @unique          // 1:1 per tenant
  mp_user_id               String                     // MP seller user_id; webhook routing key
  access_token             String                     // encrypted at rest (sub-project B)
  refresh_token            String                     // encrypted; rotates — overwrite each refresh
  public_key               String?
  scope                    String?
  token_type               String?
  live_mode                Boolean  @default(false)
  access_token_expires_at  DateTime?                  // derived from expires_in at exchange time
  created_at               DateTime @default(now())
  updated_at               DateTime @updatedAt
  tenant                   Tenant   @relation(fields: [tenant_id], references: [id])
  @@index([mp_user_id])
  @@map("mp_connections")
}
```

`MpConnection` is **declared but unused** in sub-project A. Its `access_token`/`refresh_token`
encryption and all read/write paths land in sub-project B.

### Add `tenant_id` to every tenant-owned table

**Direct tenant-owned:** `User`, `Category`, `Product`, `ProductVariant`, `Customer`, `Table`,
`Sale`, `PaymentTerminal`, `CashRegisterShift`, `StoreSettings`, `CommissionRule`, `SalesGoal`,
`FiscalQueue`, `FiscalEvent`, `FiscalSequence`, `Exchange`, `Voucher`, `Delivery`.

**Child tables (🔶 denormalized `tenant_id`):** `SaleItem`, `SalePayment`, `TerminalCharge`,
`CustomerFollowup`, `CommissionCategoryRule`, `CommissionTier`, `ExchangeItem`, `VoucherUsage`.

**Design call #1 — denormalize `tenant_id` onto children too** (not scope-via-parent). Cost: a
little more backfill. Benefit: the Prisma extension enforces **uniformly on every model**, and
isolation tests need no join-based ownership reasoning. Every such table also gets
`@@index([tenant_id])`.

### Unique-constraint changes (global → per-tenant composite)

| Model.field | Before | After |
|---|---|---|
| `Category.slug` | `@unique` | `@@unique([tenant_id, slug])` |
| `Product.barcode` | `@unique` | `@@unique([tenant_id, barcode])` |
| `ProductVariant.sku` | `@unique` | `@@unique([tenant_id, sku])` |
| `ProductVariant.barcode` | `@unique` | `@@unique([tenant_id, barcode])` (nullable) |
| `Customer.email` | `@unique` | `@@unique([tenant_id, email])` |
| `Customer.phone` | `@unique` | `@@unique([tenant_id, phone])` |
| `Customer.cpf` | `@unique` | `@@unique([tenant_id, cpf])` |
| `Table.number` | `@unique` | `@@unique([tenant_id, number])` |
| `StoreSettings.key` | `@unique` | `@@unique([tenant_id, key])` |
| `Voucher.code` | `@unique` | `@@unique([tenant_id, code])` |
| `FiscalSequence.series` | `@@unique([series])` | `@@unique([tenant_id, series])` |
| `PaymentTerminal.mp_device_id` | `@unique` | `@@unique([tenant_id, mp_device_id])` |
| `TerminalCharge.mp_order_id` | `@unique` | `@@unique([tenant_id, mp_order_id])` |

**Stay globally unique** (1:1 with a Sale via a global `cuid`, no collision risk):
`CustomerFollowup.sale_id`, `FiscalQueue.sale_id`, `Delivery.sale_id`.
`CommissionCategoryRule`'s `@@unique([commission_rule_id, category_id])` is unchanged.

**Design call #2 — `User.email` STAYS globally `@unique` (the one deliberate exception).**
This keeps login as **email + password with no tenant picker / no subdomain**: the login lookup
is the *single* sanctioned cross-tenant query, resolving which tenant the user belongs to.
Trade-off accepted: the same email cannot be reused across two lojas (fine — each loja is a
separate business).

## 2. Tenant context — `src/lib/tenant/context.ts`

`AsyncLocalStorage<{ tenantId: string }>` with:
- `runWithTenant(tenantId, fn)` — establish context for the duration of `fn`.
- `getTenantId()` — current tenant id; **throws** if called outside a tenant context (fail-closed).
- `getTenantIdOrNull()` — for the rare deliberately-unscoped path.

Context is established at every request entry by a `requireTenant()` server helper that reads the
session, 401/redirects if absent, and runs the handler inside `runWithTenant`.

## 3. Prisma tenant extension — `src/lib/tenant/prisma-tenant.ts`

- The base client (`src/lib/prisma.ts`) is renamed `basePrisma` and kept **private** (not imported
  by feature code).
- The exported `prisma` is `basePrisma.$extends({ query: { $allModels: { $allOperations } } })`:
  - **Reads** (`findMany`/`findFirst`/`findUnique`/`count`/`aggregate`/`groupBy`) → inject
    `where.tenant_id = getTenantId()`. `findUnique` is **rewritten to `findFirst`** so the
    non-unique `tenant_id` filter is allowed (the Approach 1 wrinkle).
  - **Writes** → `create`/`createMany` stamp `tenant_id`; `update`/`delete`/`updateMany`/
    `deleteMany`/`upsert` add `tenant_id` to the `where` (and to `create` for `upsert`).
  - **Bypass:** `Tenant` model operations and the login lookup use `basePrisma` directly.
    `MpConnection` access (sub-project B) will be scoped by `tenant_id` explicitly.
- `tenantDb(tenantId)` — explicit helper that runs a callback inside `runWithTenant` for
  **out-of-request** callers (the provisioning script; sub-project B's webhook handler).

## 4. Auth / session

- `SessionPayload` gains `tenantId: string` (in both `src/lib/auth.ts` and `src/lib/auth-edge.ts`).
- Login: look up the user by **global email** via `basePrisma`, verify password, derive `tenantId`
  from the user row, and sign `{ userId, role, name, tenantId }` into the `zf_session` cookie.
- `getSessionUser()` selects `tenant_id`; a 7-day cookie as today.
- `requireTenant()` is the canonical entry guard for API routes and server actions.

## 5. Data migration (shared prod DB — prod = dev, same Supabase)

All migrations additive and reviewed with `prisma migrate diff` before push. Run DDL via the
Supabase **session pooler :5432** (not the :6543 pgbouncer pool).

1. **Migration 1 (additive):** create `tenants` + `mp_connections`; add **nullable** `tenant_id`
   to all tenant-owned tables; add `@@index([tenant_id])`. Deploy.
2. **Backfill script** (`scripts/backfill-tenant.ts`): create **Tenant #1** ("Andre's loja"),
   set `tenant_id` = Tenant #1 on every existing row across all tables. Run against prod.
3. **Migration 2:** set `tenant_id` **NOT NULL**; swap global uniques → composite per the table
   above. Safe because every existing row shares Tenant #1 (no uniqueness collisions). Deploy.

Never run a destructive migration; always backfill before adding NOT NULL.

## 6. Provisioning — `scripts/create-tenant.ts`

A CLI script that creates a `Tenant` + its first **admin** `User` (password hashed via the
existing `hashPassword`). This is the "Andre creates tenants" mechanism. No public signup, no
platform-admin UI in this sub-project.

## 7. Scope existing code

- Replace `import { prisma } from "@/lib/prisma"` with the extended client across API routes,
  server actions, and lib services. Call sites are largely unchanged because the tenant id is
  ambient via AsyncLocalStorage.
- `src/lib/settings.ts` helpers become tenant-scoped automatically (they go through `prisma`);
  `StoreSettings` is now keyed `[tenant_id, key]`.
- Out-of-request workers (followup, fiscal queue) switch to `tenantDb(tenantId)`.
- Audit every route to ensure `requireTenant()` runs before any query.

## 8. Testing (non-negotiable)

- **Cross-tenant isolation suite:** seed Tenant A + Tenant B; assert that A's session cannot
  read, update, or delete any of B's `Product`, `Sale`, `Customer`, `StoreSettings`,
  `PaymentTerminal`, or `Voucher` rows — across `findUnique`/`findFirst`/`findMany`/`update`/
  `delete`/`upsert`.
- **Extension unit tests:** reads inject `tenant_id`; writes stamp/assert `tenant_id`;
  `findUnique` rewrite works; calling a scoped op outside a tenant context throws.
- **Auth test:** login resolves the correct `tenantId` into the session.
- **Migration test:** backfill assigns every existing row to Tenant #1; NOT NULL holds afterward.

## 9. Out of scope (→ sub-project B)

MP OAuth `/connect` + `/callback` routes, token encryption + refresh, replacing
`getAccessToken()` (env) with per-tenant tokens, making `devices.ts`/`orders.ts`/terminal routes/
webhook tenant-aware. Sub-project A only **declares** `MpConnection`.

## 10. Risks

- **Shared prod DB (prod = dev):** every migration additive + reviewed; backfill before NOT NULL.
- **Cross-tenant leakage (#1 risk):** mitigated by the fail-closed extension + the isolation
  suite. `getTenantId()` throws rather than returning a default.
- **`findUnique` rewrite:** must preserve `select`/`include`; covered by unit tests.
- **Login cross-tenant exception:** the *only* sanctioned unscoped read; must use `basePrisma`
  deliberately and never leak into feature code.
- **Out-of-request jobs:** any worker that forgets `tenantDb()` will throw (fail-closed), which is
  the desired safe failure mode.
