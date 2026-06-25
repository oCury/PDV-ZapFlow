# Multi-tenancy + Mercado Pago Connect — Scope Stub

**Date:** 2026-06-25
**Status:** SCOPE STUB — not yet brainstormed/specced. Start here next session.
**Repo:** PDV-ZapFlow

> This is a starting point, not a finished spec. Run the brainstorming skill to turn
> it into a full design (spec → plan → build), splitting into sub-projects as needed.

## Why this exists

The product is **multi-tenant**: one shared app (`pdv-zap-flow`), each client (loja) logs
in with their own account and **their own Mercado Pago account / maquininha**. The current
maquininha integration uses a **single** `MERCADOPAGO_ACCESS_TOKEN` from env — it can only
ever connect **one** MP account, so it cannot onboard multiple clients' terminals.

## The dependency (build order matters)

**A. Multi-tenancy foundation (must come first).** Today the app is **single-tenant**:
no `Org`/`Tenant`/`Loja` model; `User`, `Product`, `Sale`, `Customer`, `StoreSettings`,
etc. all belong to one implicit store. For many clients in one app with isolated data:
- Introduce a tenant entity (e.g. `Tenant`/`Org`) and a `tenant_id` on all tenant-owned
  tables (users, products, variants, sales, customers, terminals, settings, …).
- Scope every query and the auth/session to the current tenant; tenant-aware onboarding/signup.
- Decide isolation strategy (shared schema + `tenant_id` row scoping is the likely default).
- This is the "full multi-store refactor" explicitly deferred in the maquininha spec
  (`2026-06-24-mercadopago-point-terminal-design.md`, §1 out-of-scope). It is large —
  treat as its own spec.

**B. Mercado Pago OAuth ("Conectar com Mercado Pago" / Connect).** Replace the env token
with **per-tenant** credentials:
- Each client clicks **"Conectar Mercado Pago"** → MP OAuth authorize → callback.
- Store the tenant's `access_token` + `refresh_token` (+ expiry, MP user id) per tenant,
  encrypted at rest.
- Token-refresh handling (MP access tokens expire; use the refresh token).
- Every Point/Orders call (`listDevices`, `setOperatingMode`, `createTerminalOrder`,
  `getOrder`, webhook reconciliation) uses the **current tenant's** token instead of
  `getAccessToken()` reading `process.env`.
- `notification_url` per app/tenant for webhooks; map incoming webhooks to the right tenant.

## Open questions for the brainstorm

1. Tenancy isolation: shared-schema row scoping vs schema-per-tenant vs DB-per-tenant. (Shared
   schema + `tenant_id` is the pragmatic default for this stack.)
2. How does a new tenant sign up / get provisioned? Self-serve vs Andre creates them.
3. Migration of the existing single-store data into "tenant #1" without breaking prod.
4. MP Connect specifics: does Andre's MP application support OAuth/Connect (marketplace
   model)? Confirm the OAuth endpoints + scopes for Point.
5. Where do per-tenant secrets live (DB column encrypted vs a secrets manager)?
6. Auth: current `User`/role model → does it become tenant-scoped, or is there a separate
   tenant-admin concept?

## Touchpoints in current code (replace single-account assumptions)

- `src/lib/mercadopago/client.ts` → `getAccessToken()` reads `process.env.MERCADOPAGO_ACCESS_TOKEN`.
  Becomes per-tenant token lookup.
- `src/lib/mercadopago/devices.ts`, `orders.ts` → accept/resolve a tenant token.
- `src/app/api/terminals/*`, `src/app/api/checkout/terminal-charge/*`, webhook → tenant-aware.
- `PaymentTerminal` / `TerminalCharge` models → add `tenant_id`.
- `StoreSettings` (key-value) → tenant-scoped.

## Interim reality (today)

Until A+B exist, the deployed app works as a **single-account** setup only (one MP token in
Vercel = one account's maquininhas). Fine for Andre's own testing / a single store; not for
onboarding multiple clients.
