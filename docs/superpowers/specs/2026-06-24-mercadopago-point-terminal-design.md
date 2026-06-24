# Mercado Pago Point Smart — Terminal Integration Design

**Date:** 2026-06-24
**Status:** Approved (design) — pending implementation plan
**Author:** Brainstormed with Claude
**Repo:** PDV-ZapFlow

---

## 1. Goal & Scope

Charge **credit, debit, and PIX directly on the Mercado Pago Point Smart terminal** ("maquininha") from the PDV, with **operator-chosen installments** on credit, across **many terminals** (multi-store-ready), running in **production**.

Built on the **Mercado Pago Orders API** (point flow), which gives first-class card + PIX on one terminal and a status-event simulator for testing. Reuses the existing webhook → stock-decrement → sale-finalization machinery and replaces the incomplete legacy `createPaymentIntent` scaffold.

### In scope
- Device registry (pair/sync/manage many Point Smart terminals).
- Terminal charge flow for credit, debit, and PIX initiated from the PDV.
- Operator-chosen installments on credit (min R$5,00/parcela; max from settings).
- Webhook-driven, idempotent sale finalization with polling fallback.
- Settings UI for terminal management + end-to-end device test.

### Out of scope (separate projects)
- Full multi-store refactor (a real `Store` model scoping all data, per-store auth/reports). The registry is multi-store-*ready* via a `location_label`, but the broader refactor is explicitly deferred.
- Barcode reader / cadastro de produto work (its own spec).
- Migrating Checkout Pro (online payment links) — left as-is.

---

## 2. Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| API generation | **Orders API** (point flow) | First-class card + PIX on one terminal; has a test simulator; the legacy intent scaffold is incomplete anyway. |
| Payment scope | **Credit + Debit + PIX** on terminal | Matches how fashion customers pay. |
| Installments | **Operator picks at checkout** (1–N) | Standard for BR fashion retail. Min R$5,00/parcela. |
| Device/account state | **Have device + prod account, paired** | Build straight to production flow. |
| Multi-terminal scope | **Terminal registry, multi-store-ready** | Handles many terminals/locations without a full multi-store refactor. |
| SDK | Official **`mercadopago` SDK (v3.1+)** | Native Point/Order client; typed; replaces raw `fetch`. |

---

## 3. Current State (what exists today)

- `src/lib/mercadopago.ts` — `createPaymentIntent` / `getPayment` / `validateWebhookSignature` (legacy Payment Intents API, raw `fetch`).
- `POST /api/checkout/create-intent` — creates a legacy Point payment intent.
- `POST /api/webhooks/mercadopago` — validates signature, processes `payment.approved`, decrements stock (variant-aware), sets sale `APPROVED`.
- `GET /api/sales/[id]/status` — polled every 3s by the modal.
- `multi-payment-modal.tsx` — reads `NEXT_PUBLIC_MERCADOPAGO_DEVICE_ID`; PIX-at-terminal blocked; installments hardcoded to 1; CARD+PIX combo forbidden.
- No `mercadopago` npm package installed.
- No `Store`/`Terminal`/`Device` model; `StoreSettings` is a singleton; sales/products/customers are not scoped by store.

**Gaps this design closes:** no device-pairing UI, installments hardcoded to 1, no real-time terminal status, PIX-at-terminal blocked, no offline/error recovery, no idempotent finalization, raw `fetch` instead of SDK.

---

## 4. Data Model (Prisma)

### New: `PaymentTerminal` (device registry)

```prisma
enum TerminalOperatingMode {
  PDV
  STANDALONE
}

enum TerminalStatus {
  ONLINE
  OFFLINE
  BUSY
  UNKNOWN
}

model PaymentTerminal {
  id              String                @id @default(cuid())
  name            String                // friendly, e.g. "Caixa 1"
  mp_device_id    String                @unique
  operating_mode  TerminalOperatingMode @default(PDV)
  status          TerminalStatus        @default(UNKNOWN)
  location_label  String?               // multi-store-ready hook (nullable)
  is_active       Boolean               @default(true)
  last_seen_at    DateTime?
  created_at      DateTime              @default(now())

  charges         TerminalCharge[]

  @@index([is_active])
  @@map("payment_terminals")
}
```

### New: `TerminalCharge` (one in-flight terminal transaction)

Decouples the lifecycle of a terminal charge from the finalized `Sale`. Supports split payments and gives a clean audit trail.

```prisma
enum TerminalChargeMethod {
  CREDIT
  DEBIT
  PIX
}

enum TerminalChargeStatus {
  CREATED
  SENT
  PROCESSING
  APPROVED
  DECLINED
  CANCELED
  ERROR
  EXPIRED
}

model TerminalCharge {
  id            String               @id @default(cuid())
  sale_id       String?              // nullable until finalized
  terminal_id   String
  mp_order_id   String               @unique
  mp_payment_id String?
  amount        Decimal              @db.Decimal(10, 2)
  method        TerminalChargeMethod
  installments  Int                  @default(1)
  status        TerminalChargeStatus @default(CREATED)
  error_code    String?
  created_at    DateTime             @default(now())
  resolved_at   DateTime?

  terminal      PaymentTerminal      @relation(fields: [terminal_id], references: [id])
  sale          Sale?                @relation(fields: [sale_id], references: [id])

  @@index([terminal_id])
  @@index([sale_id])
  @@index([status])
  @@map("terminal_charges")
}
```

### Extend: `SalePayment`

Add to the existing model (which already supports split payments):

```prisma
  terminal_charge_id String?
  installments       Int?
  card_brand         String?
  mp_payment_id      String?
```

### Extend: `StoreSettings`

```prisma
  max_installments   Int @default(1)   // ceiling for the operator installment selector
```

### Extend: `Sale`

Add the back-relation:

```prisma
  terminal_charges TerminalCharge[]
```

**Migration note:** `prisma db push` requires the direct Supabase connection (port 5432), not pgbouncer (6543) — temporarily swap `DATABASE_URL` per the project convention.

---

## 5. Lib Layer — `src/lib/mercadopago/` (small modules)

Install official **`mercadopago` SDK (v3.1+)**, replacing raw `fetch`. Split the current single file into focused modules:

- `client.ts` — configured SDK client (access token from env, idempotency-key helper).
- `devices.ts` — `listDevices()`, `setOperatingMode(deviceId, mode)`.
- `orders.ts` — `createTerminalOrder({ terminalDeviceId, amount, method, installments, externalRef })`, `getOrder(orderId)`, `cancelOrder(orderId)`.
- `webhook.ts` — signature validation + topic routing (point/order events).

Each module has one clear purpose and is independently testable. The old `src/lib/mercadopago.ts` is removed once callers are migrated; the Checkout Pro `payment-link` logic moves into `src/lib/mercadopago/checkout.ts`.

---

## 6. API Routes

### Terminal management — `src/app/api/terminals/`
- `GET /api/terminals` — list registry rows with live status.
- `POST /api/terminals/sync` — pull devices from MP (`listDevices`), upsert into registry, force `PDV` operating mode on each.
- `PATCH /api/terminals/[id]` — update `name`, `is_active`, `location_label`.

### Checkout — replaces `create-intent`
- `POST /api/checkout/terminal-charge` — body `{ saleDraft, terminalId, method, installments }`. Validates (Zod), enforces "one active charge per terminal", creates an MP Order, persists a `TerminalCharge` (status `SENT`), returns `{ chargeId }`.
- `GET /api/checkout/terminal-charge/[id]` — returns current `TerminalCharge` status (UX polling fallback; also calls `getOrder` if not yet resolved).
- `POST /api/checkout/terminal-charge/[id]/cancel` — cancels the in-flight order (handles MP 409 "device busy").

### Webhook — extend `src/app/api/webhooks/mercadopago/route.ts`
- Add handling for the **Orders** webhook topic.
- Resolve `mp_order_id` → `TerminalCharge` → call the shared `finalizeCharge`.
- Keep existing Checkout Pro `payment` handling working.

---

## 7. Result Handling & Idempotency (critical correctness)

- **Webhook is the source of truth; polling is a UX fallback.** Both converge on one **idempotent `finalizeCharge(orderId)`** keyed by `mp_order_id`. It runs in a transaction and is a no-op if the charge is already `APPROVED`/finalized — so webhook + poll never double-decrement stock or double-award loyalty. (This fixes a latent double-apply risk in the current poll-only flow.)
- **`finalizeCharge` responsibilities:** mark `TerminalCharge` resolved with `mp_payment_id`; create/attach `SalePayment` (with `installments`, `card_brand`, `mp_payment_id`); set `Sale` status; decrement stock (variant-aware, reusing existing logic); award loyalty if applicable; trigger NFC-e/WhatsApp as today.
- **One active charge per terminal:** enforced in the DB (a terminal with a non-terminal-state `TerminalCharge` rejects a new charge) and surfaced before calling MP.
- **Error catalog → operator messages:**
  - MP 409 device busy → "Maquininha ocupada — cancele a cobrança anterior."
  - Offline / timeout → "Maquininha sem conexão. Verifique a internet do dispositivo."
  - Declined → "Pagamento recusado. Tente outro cartão ou método."
  - Min installment R$5,00 enforced client-side **before** send.
  - 403 integrator not registered → config error surfaced in settings (app missing "PointdeMercadoPago" product).

---

## 8. Settings UI — `src/app/settings/terminals/`

- List terminals with **live status badges** (ONLINE/OFFLINE/BUSY/UNKNOWN).
- **"Sincronizar dispositivos"** button → calls `POST /api/terminals/sync` (pulls from MP, sets PDV mode).
- Inline edit: `name`, `location_label`, `is_active`.
- **"Teste de cobrança R$1,00"** button per terminal → runs a real end-to-end charge to validate the device.
- Replaces the fragile `NEXT_PUBLIC_MERCADOPAGO_DEVICE_ID` env var (device IDs now live in the DB).

---

## 9. PDV Checkout Flow — extend `multi-payment-modal.tsx`

1. **Select terminal** — defaults to the station's configured terminal; selectable if many.
2. **Choose method** — Crédito / Débito / PIX.
3. **If crédito** — installments selector (1–N), honoring min R$5,00/parcela and `StoreSettings.max_installments`.
4. **"Enviar para maquininha"** → creates the charge, shows a **live status panel** (aguardando → processando → aprovado/recusado) driven by polling the charge status (webhook resolves it server-side).
5. **Cancelar** button while in-flight → calls the cancel route.
6. **On approval** → finalize, then print/emit NFC-e and send WhatsApp summary as today.
7. **Split payments preserved** — e.g. part on card via terminal + part PIX/cash; each terminal leg is its own `TerminalCharge`.

---

## 10. Config & Ops

- Production `MERCADOPAGO_ACCESS_TOKEN` (server-side only).
- `MERCADOPAGO_WEBHOOK_SECRET` for signature validation.
- MP application must carry the **"PointdeMercadoPago"** product (else 403 "Integrator isn't registered").
- `notification_url` configured at the **app level** in the MP dashboard (per-request notification_url is not supported by the integrations API).
- New `StoreSettings.max_installments` field.
- Remove `NEXT_PUBLIC_MERCADOPAGO_DEVICE_ID` from client config once the registry replaces it.

---

## 11. Testing

- **Unit:** lib modules (`devices`, `orders`, `webhook`) and `finalizeCharge` idempotency (webhook+poll race; double-call is a no-op).
- **Integration:** `terminal-charge` route with a mocked MP SDK (happy path, 409 busy, decline, offline).
- **Status transitions:** the **Orders event simulator** (`POST /v1/orders/{id}/events`) to drive processed/failed/canceled without a physical tap — usable in CI.
- **E2E:** one happy-path (approved credit sale) with MP mocked (Playwright).
- **Manual:** real device smoke test via the settings "Teste de cobrança R$1,00" button before go-live.

---

## 12. Risks & Open Items

- **PIX-on-terminal exact Orders payload** — verify the precise Orders request body for a point PIX charge against current MP docs during implementation (card vs PIX `type`/`payment_method` fields).
- **Webhook topic naming** — confirm the Orders webhook topic/event string and payload shape in the MP dashboard before wiring `webhook.ts` routing.
- **SDK Point/Order method surface** — confirm the `mercadopago` v3.1+ class/method names for device listing, mode-setting, and order create/get/cancel; fall back to typed REST wrappers for any method the SDK doesn't expose.
- **Re-pairing** — moving device IDs from env to DB means operators re-pair once via the new settings UI.

---

## 13. Build Order (high level — full plan to follow)

1. Schema + migration (`PaymentTerminal`, `TerminalCharge`, `SalePayment`/`StoreSettings`/`Sale` extensions).
2. Lib layer (`src/lib/mercadopago/` modules + SDK install).
3. Terminal management routes + settings UI (pair/sync/test).
4. Terminal-charge routes + idempotent `finalizeCharge`.
5. Webhook extension for Orders topic.
6. PDV modal flow (method + installments + live status + cancel).
7. Tests (unit/integration/simulator/e2e) + manual device smoke test.
