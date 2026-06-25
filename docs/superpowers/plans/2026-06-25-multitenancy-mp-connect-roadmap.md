# Multi-tenancy + Mercado Pago Connect — Next-Session Roadmap

**Date:** 2026-06-25
**Type:** Phased roadmap with decision gates (NOT a granular task plan yet)
**Repo:** PDV-ZapFlow
**Companion:** scope stub `docs/superpowers/specs/2026-06-25-multitenancy-mp-connect-scope.md`

> Each sub-project (A, B) gets its **own** brainstorm → spec → plan → build next session.
> This roadmap sequences them and pre-decides the open questions (with recommended
> defaults) so Phase 0 is a fast confirmation, not a long discovery.

## Goal

Turn PDV-ZapFlow into a **multi-tenant SaaS** where each client (loja) logs into the one
shared app with isolated data and connects **their own** Mercado Pago account/maquininha —
replacing the single global `MERCADOPAGO_ACCESS_TOKEN`.

## Recommended architecture (confirm in Phase 0)

| Decision | Recommended default | Why |
|---|---|---|
| Isolation | **Shared schema + `tenant_id` row scoping** (one DB, one deploy) | Simplest for this stack/scale; avoids per-tenant infra. |
| Tenant model | `Tenant` (id, name, slug, plan, created_at) + `MpConnection` (per tenant) | Clean separation of identity vs MP creds. |
| Query scoping | Prisma **client extension** + request-scoped tenant context | Centralizes `tenant_id` enforcement; avoids per-query mistakes. |
| Auth | Add `tenant_id` to `User`; session resolves current tenant; signup creates Tenant + first admin | Reuses existing auth. |
| MP creds | **MP OAuth / Connect** → store `access_token`+`refresh_token`+`expires_at`+`mp_user_id` per tenant, **encrypted** (AES-GCM, key from env) | Per-client accounts; YOUR app is the integrator. |
| Migration | Create **Tenant #1**, backfill `tenant_id` on all existing rows → Tenant #1, then enforce NOT NULL | Additive, preserves prod data (prod=dev same Supabase DB). |

**Key upside to verify:** with MP **Connect (OAuth)**, *your application* is the registered
Point integrator and each client merely **authorizes** it. That likely **removes the per-client
403 "integrator not registered"** problem we hit — clients won't each need to register a Point
app. Confirm this in Phase 0.

## Phase 0 — Decisions + discovery (start of next session, ~brainstorm)

- [ ] Confirm the table above (or adjust isolation/secret strategy).
- [ ] Verify Andre's MP account supports **OAuth/Connect** (marketplace): authorize URL, token
      exchange endpoint, scopes for Point, redirect URI registration. Capture in a contract doc.
- [ ] Decide tenant provisioning: self-serve signup vs Andre creates tenants.
- [ ] Decide encryption approach for stored tokens (env key vs secret manager).
- [ ] Confirm migration plan for the existing single store → Tenant #1.

## Phase 1 — Tenancy foundation (sub-project A → own spec→plan→build)

1. Schema: add `Tenant` + `MpConnection` models; add `tenant_id` to all tenant-owned tables
   (`User`, `Product`, `ProductVariant`, `Category`, `Sale`, `SaleItem`, `SalePayment`,
   `Customer`, `Table`, `CashRegisterShift`, `StoreSettings`, `PaymentTerminal`,
   `TerminalCharge`, `Delivery`, commissions/vouchers/exchanges/fiscal/goals…). Nullable first.
2. Request-scoped **tenant context** (resolve from session) + Prisma extension that injects/asserts
   `tenant_id` on reads & writes.
3. Auth/session: attach `tenant_id`; signup/onboarding creates Tenant + admin User.
4. **Data migration:** create Tenant #1, backfill all existing rows, then make `tenant_id` NOT NULL.
   (Additive; use Supabase **session pooler :5432** for DDL; prod=dev same DB — review diff before push.)
5. Scope all existing API routes/queries to the current tenant; add tests for cross-tenant isolation.

## Phase 2 — Mercado Pago Connect (sub-project B → own spec→plan→build)

1. OAuth flow: `/api/mp/connect` (redirect to MP authorize) + `/api/mp/callback` (exchange code,
   store encrypted `MpConnection` for the tenant). "Conectar Mercado Pago" button + status in
   `/settings/terminals`.
2. Token layer: `getTenantMpToken(tenantId)` with **refresh** handling; replace
   `src/lib/mercadopago/client.ts` `getAccessToken()` (env) everywhere.
3. Make `devices.ts` / `orders.ts` / terminal routes / webhook **tenant-aware** (pass/resolve token).
4. Webhook → resolve the tenant (by `mp_user_id` / order → `TerminalCharge.tenant_id`); per-tenant
   `notification_url` if required.
5. Remove reliance on the `MERCADOPAGO_ACCESS_TOKEN` env var; tests for connect/refresh/charge.

## Risks & gotchas

- **Shared prod DB** (prod=dev): every migration additive + reviewed; backfill before NOT NULL.
- **Cross-tenant leakage** is the #1 risk — the Prisma scoping extension + isolation tests are non-negotiable.
- **MP Connect approval**: the marketplace/OAuth flow may need MP app review; confirm early (Phase 0).
- **Token security**: never log tokens; encrypt at rest; rotate the encryption key carefully.
- **Existing store** becomes Tenant #1 — don't break the live single store during migration.

## How to start next session

> Prompt: *"Brainstorm multi-tenancy + Mercado Pago Connect for PDV-ZapFlow."*
> Read `docs/superpowers/specs/2026-06-25-multitenancy-mp-connect-scope.md` and this roadmap.
> Run Phase 0 (confirm decisions), then brainstorm → spec → plan → build **sub-project A first**,
> then **sub-project B**. Each is its own spec/plan cycle.

Also still open (separate tracks): **barcode reader** feature (queued, not started) and finalizing
the **landing page plan contents** (placeholders in `zapflow-landing/src/lib/plans.ts`).
