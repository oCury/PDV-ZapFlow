# Multi-Acquirer Terminal Provider-Picker — Design

- **Date:** 2026-07-03
- **Status:** Approved design (design only — no implementation in this pass)
- **Author:** Andre + Claude
- **Repo:** `PDV-ZapFlow` (Next.js / Prisma / Supabase, multi-tenant POS)
- **Related memory:** `pdv_multi_acquirer_strategy`, `project_pdv_zapflow`

## 1. Problem & Context

PDV-ZapFlow tenants own maquininhas from **different acquirers** (Stone, PagSeguro/Moderninha,
Mercado Pago, Cielo, Rede, GetNet, SumUp/Ton). The goal is to let the PDV push a card charge to
whatever physical terminal the merchant already has (PDV sends amount → charge pops on their
terminal → webhook confirms), instead of manual typing.

Today the terminal integration is **hardcoded to Mercado Pago (MP)**. There is one MP library, one
MP webhook, and MP-specific columns on the data model. Research (2026-07-03, web-verified) confirmed
no single API drives all brands from a web app, so the product decision is a **provider-picker**:
each terminal runs on a chosen provider behind **one driver abstraction**. Initial providers:

- **`mercadopago`** — already built (cloud Orders/Point push). Refactored onto the abstraction.
- **`stone`** — Stone Connect 2.0 (via Pagar.me API). Built against public docs; sandbox until homologação.
- **`connecttef`** — ConnectTEF SmartTEF middleware (one HTTP API → Stone/Cielo/PagBank/GetNet/Rede/MP/SumUp).
  Requires the merchant's maquininha to be an **Android SmartPOS** running the ConnectTEF agent app.

This document is the approved design. Implementation planning follows separately.

## 2. Goals / Non-Goals

**Goals**
- One provider-neutral driver abstraction; the cashier flow (send amount → poll status → confirm via
  webhook) is identical across providers.
- Providers selectable **per terminal-device**, with a store-wide default.
- Per-tenant, **encrypted** credentials for every provider (closing the current MP plaintext gap).
- Stone + ConnectTEF drivers buildable now against public docs, demoable via an **interactive sandbox**,
  and flippable to live when partnership credentials land.
- No regression to the working MP terminal flow.

**Non-Goals**
- Real Stone/ConnectTEF certification or partnership onboarding (business-side; out of scope for code).
- Cielo / SumUp / Rede / GetNet native drivers (future; the abstraction leaves room for them).
- Classic TEF (SiTef/PayGo, PC + wired pinpad) — wrong fit for a web PDV.
- Plan-gating providers (deferred; see §14).

## 3. Current State (grounded in code)

Mercado Pago library — `src/lib/mercadopago/`:
- `client.ts` — `mpFetch(path, init?)`; `getAccessToken()` reads the **global** `MERCADOPAGO_ACCESS_TOKEN`
  env var; `MpApiError`.
- `orders.ts` — `createTerminalOrder(input)` (POST `/v1/orders`, type `point`), `getOrder(id)`, `cancelOrder(id)`.
- `amount.ts` — `toAmountString`, `methodToMpType`, `validateInstallments` (min parcela R$5, max cap).
- `devices.ts` — `listDevices()`, `setOperatingMode(deviceId, mode)`.
- `finalize.ts` — `finalizeCharge(orderId, input)`: **idempotent** DB reconciliation via `basePrisma`,
  keyed on `mp_order_id`; on approval marks charge `APPROVED`, creates `SalePayment`, decrements stock
  (variant- or product-level) inside one transaction.
- `errors.ts` — `mapMpErrorToOperatorMessage(err) → OperatorError` (`DEVICE_BUSY|OFFLINE|DECLINED|CONFIG|GENERIC`).
- `checkout.ts` — `validateWebhookSignature`, `getPayment` (legacy Checkout Pro path).

Charge flow:
- `POST /api/checkout/terminal-charge` — validates, active-charge check (409 `DEVICE_BUSY`), creates
  `Sale (PENDING)` + reserves `TerminalCharge (CREATED, mp_order_id="pending_<sale.id>")`, calls
  `createTerminalOrder`, sets `mp_order_id` + `status SENT`. On error: charge `ERROR`, delete sale, 502.
- `GET /api/checkout/terminal-charge/[id]` — poll; lazy `getOrder` + `finalizeCharge`; returns
  `{ status, approved, saleId }`.
- `POST /api/checkout/terminal-charge/[id]/cancel` — `cancelOrder` + mark `CANCELED`.
- `POST /api/webhooks/mercadopago` — validates signature; on `order` topic, `getOrder` → `finalizeCharge`.

Data model (`prisma/schema.prisma`):
- `PaymentTerminal` — `mp_device_id`, `@@unique([tenant_id, mp_device_id])`, `operating_mode`, `status`.
- `TerminalCharge` — `mp_order_id`, `mp_payment_id`, `@@unique([tenant_id, mp_order_id])`, `status` enum
  (`CREATED|SENT|PROCESSING|APPROVED|DECLINED|CANCELED|ERROR|EXPIRED`), `method` enum (`CREDIT|DEBIT|PIX`).
- `MpConnection` — per-tenant OAuth tokens **stored plaintext** (no encryption util exists).
- `Tenant` — `plan Plan?` (`basic|pro|enterprise`); entitlement `payments.terminal` is in **all** plans.

Multi-tenancy:
- `src/lib/prisma.ts` — `basePrisma` (unscoped) vs `prisma` (tenant-scoped via middleware).
- `src/lib/tenant/scope.ts` — `PaymentTerminal`, `TerminalCharge`, `SalePayment` are tenant-owned;
  `tenant_id` auto-injected.
- `src/lib/tenant/resolve-tenant.ts` — cookie-first, else `AsyncLocalStorage` via `runWithTenant()`,
  else fail-closed. Webhooks use `basePrisma` (no session) and currently resolve across all tenants
  by `mp_order_id`.

Existing driver pattern to mirror — `src/lib/delivery/types.ts`:
```ts
export interface DeliveryCarrier {
  readonly name: string;
  quote(input): Promise<CarrierResult<DeliveryQuote>>;
  dispatch(input): Promise<CarrierResult<DeliveryDispatchResult>>;
  getStatus(externalId): Promise<CarrierResult<{ status: DeliveryStatus }>>;
  cancel(externalId): Promise<CarrierResult>;
}
```

## 4. Decisions

| Fork | Decision |
|------|----------|
| Provider granularity | **Per-terminal + store default.** `provider` on `PaymentTerminal`; a `StoreSettings` key sets the default for new terminals. A tenant can mix (e.g. an MP terminal and a Stone terminal). |
| Credential model | **Generic encrypted `ProviderConnection` table** absorbing `MpConnection`; add an AES-256-GCM encrypt/decrypt util — closes the plaintext gap. |
| Mock strategy | **Interactive sandbox.** Mock drivers simulate the full flow and auto-approve, demoable end-to-end; flip `mode` to live when creds land. |
| Where logic lives | **Thin drivers + provider-neutral service** (approach A), mirroring `DeliveryCarrier`. |

## 5. Architecture

```
API routes (thin controllers)
  → TerminalService (provider-neutral orchestration + idempotent finalize)
     → registry.resolveDriver(connection)  →  TerminalDriver (per-provider I/O only)
```

Drivers are **pure**: they receive decrypted credentials as arguments (never read env/DB), perform
HTTP, and normalize provider status → our `TerminalChargeStatus`. The service owns all stateful work
(Prisma, tenant scoping, idempotency, stock).

New module: `src/lib/terminals/`.

## 6. Driver contract — `src/lib/terminals/types.ts`

```ts
export type TerminalProviderName = "mercadopago" | "stone" | "connecttef";

export type DriverResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: OperatorError };   // reuse existing OperatorError union

export interface ProviderCredentials {         // decrypted blob, provider-specific shape
  [k: string]: unknown;
}

export interface CreateChargeInput {
  deviceExternalId: string;   // PaymentTerminal.device_external_id
  amount: number;             // reais
  method: TerminalChargeMethod;
  installments: number;
  externalRef: string;        // our TerminalCharge.id — idempotency key
}

export interface ProviderCharge {
  externalOrderId: string;
  externalPaymentId?: string;
  status: TerminalChargeStatus;   // NORMALIZED to our enum
  cardBrand?: string;
  raw?: unknown;
}

export interface WebhookResolution {
  providerName: TerminalProviderName;
  externalOrderId: string;
  status: TerminalChargeStatus;   // normalized
  externalPaymentId?: string;
  cardBrand?: string;
  tenantHint?: { key: string; value: string };  // e.g. mp collector user_id, stone merchant id
}

export interface ProviderDevice { id: string; operatingMode?: "PDV" | "STANDALONE"; }

export interface DriverCapabilities {
  deviceSync: boolean;      // MP: true · ConnectTEF: false (merchant's own Android POS)
  operatingModes: boolean;  // MP: true
  cancel: boolean;
  installments: boolean;
  methods: TerminalChargeMethod[];   // subset of CREDIT|DEBIT|PIX supported
}

export interface TerminalDriver {
  readonly name: TerminalProviderName;
  readonly capabilities: DriverCapabilities;

  // charge lifecycle (required)
  createCharge(creds: ProviderCredentials, input: CreateChargeInput): Promise<DriverResult<ProviderCharge>>;
  getChargeStatus(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<ProviderCharge>>;
  cancelCharge(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<void>>;

  // webhook (required)
  verifyWebhook(headers: Record<string, string>, rawBody: string, creds?: ProviderCredentials): boolean;
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<DriverResult<WebhookResolution>>;

  // device management (OPTIONAL — capability-gated)
  listDevices?(creds: ProviderCredentials): Promise<DriverResult<ProviderDevice[]>>;
  setOperatingMode?(creds: ProviderCredentials, deviceId: string, mode: "PDV" | "STANDALONE"): Promise<DriverResult<void>>;
}
```

`OperatorError` and `TerminalChargeStatus`/`TerminalChargeMethod` are the existing types, re-exported.

## 7. Registry + Sandbox — `src/lib/terminals/registry.ts`

```ts
resolveDriver(connection: ProviderConnection): TerminalDriver
```
- `mode === "live"` → the real driver instance (`mercadoPagoDriver`, `stoneDriver`, `connectTefDriver`).
- `mode === "sandbox"` → `sandboxDriver(connection.provider)`.

**SandboxDriver** simulates realistically without fragile serverless timers:
- `createCharge` → returns a fake `externalOrderId` + `status: PROCESSING`.
- `getChargeStatus` → `PROCESSING` until ~4s elapsed since the charge's `created_at`, then `APPROVED`
  (elapsed-time based, so the **existing poll path** finalizes it — no background timer needed).
- `parseWebhook`/`verifyWebhook` → accept and resolve to APPROVED for the referenced order.
- A dev-only `POST /api/dev/terminal/simulate-webhook` (guarded by `NODE_ENV !== "production"`)
  exercises the webhook path explicitly.

This lets the picker + R$1 test charge demo end-to-end with zero real credentials.

## 8. Data Model Changes (Prisma)

Enums:
```prisma
enum TerminalProviderName { mercadopago stone connecttef }
enum ProviderMode        { sandbox live }
enum ConnectionStatus    { disconnected sandbox live error }
```

`PaymentTerminal`:
- add `provider TerminalProviderName @default(mercadopago)`
- generalize `mp_device_id` → `device_external_id`
- `@@unique([tenant_id, provider, device_external_id])`

`TerminalCharge`:
- add `provider TerminalProviderName @default(mercadopago)`
- `mp_order_id` → `external_order_id`, `mp_payment_id` → `external_payment_id`
- `@@unique([tenant_id, provider, external_order_id])`

New `ProviderConnection` (absorbs `MpConnection`):
```prisma
model ProviderConnection {
  id                  String               @id @default(cuid())
  tenant_id           String
  provider            TerminalProviderName
  credentials         String               // AES-256-GCM encrypted JSON
  mode                ProviderMode         @default(sandbox)
  status              ConnectionStatus     @default(disconnected)
  external_account_id String?              // mp user_id / stone merchant id — webhook tenant resolution
  created_at          DateTime             @default(now())
  updated_at          DateTime             @updatedAt

  @@unique([tenant_id, provider])
  @@index([provider, external_account_id])
  @@map("provider_connections")
}
```

Store-wide default provider: a `StoreSettings` key `default_terminal_provider` (default `mercadopago`).
Reuses the existing settings system — **no schema change**.

## 9. Credential Encryption — `src/lib/crypto/secretbox.ts`

- AES-256-GCM. Key from `CREDENTIALS_ENC_KEY` (32-byte, base64), validated present at startup.
- `encryptJson(obj): string` → `base64(iv).base64(authTag).base64(ciphertext)`.
- `decryptJson<T>(blob): T`.
- Applied to every `ProviderConnection.credentials`, including migrated MP tokens.

Per-provider decrypted credential shapes:
- **mercadopago**: `{ accessToken, refreshToken?, mpUserId, publicKey? }`.
- **stone**: `{ apiKey, merchantId, ... }` (per Stone Connect 2.0 / Pagar.me docs).
- **connecttef**: `{ endpoint, agentToken, merchantId, ... }` (per ConnectTEF docs).

## 10. Service — `src/lib/terminals/service.ts`

Provider-neutral orchestration lifted out of the routes:
- `initiateCharge({ terminalId, method, installments, totalAmount, items, customerId })`
  1. load `PaymentTerminal` (→ provider + `device_external_id`)
  2. load tenant `ProviderConnection(provider)`; guard `status`/`mode`; decrypt creds
  3. capability guard: method ∈ `capabilities.methods`; if `installments>1` require `capabilities.installments`
  4. existing `validateInstallments` (max from `max_installments` setting)
  5. active-charge check → 409 `DEVICE_BUSY`
  6. create `Sale (PENDING)` + reserve `TerminalCharge (CREATED, provider)`
  7. `driver.createCharge(creds, { …, externalRef: charge.id })`
  8. ok → set `external_order_id` + `status SENT`; error → `ERROR`, delete sale, map `OperatorError`
- `pollCharge(chargeId)` — lazy `driver.getChargeStatus` + `finalizeCharge`; returns `{ status, approved, saleId }`.
- `cancelCharge(chargeId)` — `driver.cancelCharge` (if `capabilities.cancel`) + mark `CANCELED`.
- `handleWebhook(providerName, headers, rawBody)` — `driver.verifyWebhook` + `parseWebhook` →
  resolve tenant (§11) → `finalizeCharge`.

Idempotent finalizer moves to `src/lib/terminals/finalize.ts`, re-keyed on `(provider, external_order_id)`
but preserving the exact transaction (mark status → create `SalePayment` → decrement stock). Status is
already normalized by the driver, so the provider-specific `"approved"/"processed"` mapping lives in each
driver, not the finalizer.

API routes become thin controllers over the service. Existing request/response shapes are preserved.

## 11. Webhooks

- Keep `POST /api/webhooks/mercadopago` (MP webhooks already registered there) → `handleWebhook("mercadopago", …)`.
- Add generic `POST /api/webhooks/terminal/[provider]` → `handleWebhook(provider, …)` for `stone`/`connecttef`.
- Tenant resolution: `WebhookResolution.tenantHint` → `ProviderConnection(provider, external_account_id)`
  → `tenant_id`; run the finalize under `runWithTenant(tenantId)` so scoped Prisma behaves. Fallback:
  the current cross-tenant lookup by `(provider, external_order_id)` when no hint is available.

## 12. Drivers

- **MercadoPagoDriver** — thin wrapper over `src/lib/mercadopago/*`. `createCharge → createTerminalOrder`,
  `getChargeStatus → getOrder + normalize`, `cancelCharge → cancelOrder`, `verifyWebhook →
  validateWebhookSignature`, `parseWebhook → getOrder → resolution`, `listDevices`/`setOperatingMode`
  → existing. **Sources the token from `ProviderConnection` creds instead of the env token** (finishes
  per-tenant MP wiring). `capabilities: { deviceSync:true, operatingModes:true, cancel:true, installments:true, methods:[CREDIT,DEBIT,PIX] }`.
- **StoneDriver** — Stone Connect 2.0 / Pagar.me public docs. `deviceSync` per Stone; `mode` defaults
  `sandbox` until homologação.
- **ConnectTefDriver** — ConnectTEF HTTP API docs. `deviceSync:false` (device = merchant's registered
  Android SmartPOS running the agent); `listDevices`/`setOperatingMode` omitted.
- **SandboxDriver** — shared realistic mock (§7).

## 13. Picker UI — `/settings/terminals`

Adds a **Providers** section:
- Per provider: a `ProviderConnection` card — status pill (`disconnected|sandbox|live|error`), mode
  toggle, provider-specific credential entry (MP keeps its OAuth connect button; Stone an API-key form;
  ConnectTEF an agent-config form).
- A store-default provider selector (writes `default_terminal_provider`).
- Terminal list rows show a provider badge; the "add terminal" action picks a provider (default
  preselected). "Sync devices" renders only when `driver.capabilities.deviceSync`.

Minimal, reuses the existing admin page.

## 14. Error Handling, Testing, Rollout

**Error handling** — reuse `OperatorError` (`DEVICE_BUSY|OFFLINE|DECLINED|CONFIG|GENERIC`); each driver
maps its provider errors into it. Not-connected / not-live / unsupported capability → `CONFIG` before
hitting the provider. Routes keep today's HTTP mapping (409/502/…).

**Testing**
- Driver-conformance suite run against every driver (create idempotency, status-normalization table,
  webhook parse/verify).
- Service tests with `SandboxDriver`: initiate / poll / cancel; double-webhook idempotency.
- `secretbox` encrypt/decrypt round-trip.
- `MpConnection → ProviderConnection` backfill migration test.
- One e2e: connect a sandbox provider → R$1 test charge → auto-approves.

**Rollout** (prod=dev share one DB — every step backward-safe):
1. Additive migration: new nullable columns + enums; backfill `provider=mercadopago`, copy
   `mp_device_id→device_external_id`, `mp_order_id→external_order_id`.
2. `MpConnection → ProviderConnection` data migration **with encryption**.
3. Switch code to the service/driver layer.
4. Later migration drops the old MP-specific columns and `MpConnection`.

**Entitlements** — keep `payments.terminal` table-stakes (all plans). Plan-gating specific providers
(e.g. `connecttef` to pro+) is **deferred/YAGNI**; revisit if commercial cost per provider warrants it.

## 15. Open Items (non-blocking; tracked in the plan)

- Verify the MP terminal path's current **env-token vs per-tenant** usage (`getAccessToken()` reads env;
  `resolveMpAccessToken` claimed in memory not found by the explorer) before repointing to `ProviderConnection`.
  Confirm no fallback-tenant reliance on the global env token.
- External/business questions (drivers ship against public docs + sandbox until answered): Stone — does
  Connect 2.0 cover Ton terminals? onboarding SLA/min volume? Cielo — Integração Remota live post-Oct-2025?
  ConnectTEF — pricing, sandbox, supported SmartPOS models, merchant agent-install process? SumUp — Cloud
  API enabled for BR devices?

## 16. File Manifest

**New**
- `src/lib/terminals/types.ts` — driver contract + shared types
- `src/lib/terminals/registry.ts` — `resolveDriver`
- `src/lib/terminals/service.ts` — orchestration
- `src/lib/terminals/finalize.ts` — generalized idempotent finalizer
- `src/lib/terminals/drivers/mercadopago.ts`
- `src/lib/terminals/drivers/stone.ts`
- `src/lib/terminals/drivers/connecttef.ts`
- `src/lib/terminals/drivers/sandbox.ts`
- `src/lib/crypto/secretbox.ts`
- `src/app/api/webhooks/terminal/[provider]/route.ts`
- `src/app/api/dev/terminal/simulate-webhook/route.ts` (dev-only)
- Prisma migration(s) for §8

**Changed**
- `prisma/schema.prisma` — enums, `PaymentTerminal`, `TerminalCharge`, new `ProviderConnection`, drop `MpConnection` (final step)
- `src/app/api/checkout/terminal-charge/route.ts` — thin controller over `service.initiateCharge`
- `src/app/api/checkout/terminal-charge/[id]/route.ts` — over `service.pollCharge`
- `src/app/api/checkout/terminal-charge/[id]/cancel/route.ts` — over `service.cancelCharge`
- `src/app/api/webhooks/mercadopago/route.ts` — over `service.handleWebhook`
- `src/app/api/terminals/sync/route.ts` — via driver `listDevices`/`setOperatingMode` (capability-gated)
- `src/app/(app)/settings/terminals/page.tsx` — Providers section + provider badges
- `src/lib/tenant/scope.ts` — add `ProviderConnection` to tenant-owned models
- `src/lib/mercadopago/client.ts` — accept a per-tenant token instead of only the env token
```
