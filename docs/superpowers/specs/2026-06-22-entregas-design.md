# Entregas (Deliveries) — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design) — pending implementation plan
**Author:** Andre + Claude

## Goal

Add an **Entregas** screen to PDV-ZapFlow that lets store operators manage the
delivery lifecycle of sales that require shipping — track status, record
carrier/tracking/driver details, and notify the customer via WhatsApp.

The design is **provider-agnostic**: a pluggable carrier layer lets external
couriers (99, Correios, etc.) be wired in later. Only a **MANUAL** (operator-
handled) carrier is live in v1. The **99 CORP API** adapter is stubbed and
wire-ready but inactive (no 99 Empresas contract yet, and 99's delivery product
availability in Brazil is uncertain as of June 2026).

## Context / current state

- `Sale` already carries shipping data: `shipping_cost`, `shipping_method`
  (`CORREIOS | TRANSPORTADORA | MOTOBOY | RETIRADA`), `shipping_address`,
  `shipping_cep`, and `channel` (`PDV | ONLINE | WHATSAPP`).
- There is **no** delivery lifecycle/tracking today — no status, carrier
  tracking, or driver state. That is the gap this feature fills.
- WhatsApp sending already exists via the Evolution API integration
  (`src/lib/whatsapp/`, `/api/whatsapp/send`).
- Stack: Next.js 15 (App Router), Prisma 6 + PostgreSQL (Supabase), Tailwind v4,
  Zod 4. Auth via cookie session (`getSession()` from `@/lib/auth`); middleware
  lets all `/api/*` through, so each route guards itself.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| What populates the screen | Delivery-flagged sales appear **automatically** |
| Data storage | **New `Delivery` model**, 1:1 with `Sale` |
| Customer notifications | **Manual WhatsApp button** (operator-triggered) |

## 1. Data model — new `Delivery` model

```prisma
enum DeliveryStatus {
  PENDING     // aguardando preparo
  READY       // pronto para envio
  DISPATCHED  // saiu para entrega
  DELIVERED   // entregue
  FAILED      // tentativa falhou
  CANCELLED   // cancelada
}

model Delivery {
  id              String   @id @default(cuid())
  sale_id         String   @unique            // 1:1 with Sale
  status          DeliveryStatus @default(PENDING)
  carrier         String   @default("MANUAL") // MANUAL | MOTOBOY | CORREIOS | TRANSPORTADORA | NINETYNINE
  external_id     String?  // carrier ride/shipment id (e.g. 99 ride id)
  tracking_code   String?
  tracking_url    String?
  recipient_name  String?  // snapshot, independent of later customer edits
  recipient_phone String?
  address         String?
  cep             String?
  fee             Decimal? @db.Decimal(10,2)  // seeded from sale.shipping_cost
  driver_name     String?  // for motoboy / 99
  driver_phone    String?
  notes           String?
  dispatched_at   DateTime?
  delivered_at    DateTime?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  sale Sale @relation(fields: [sale_id], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([carrier])
  @@map("deliveries")
}
```

Add the back-relation on `Sale`:

```prisma
delivery Delivery?
```

**No data backfill** is required — see §2.

## 2. Auto-population (lazy upsert)

A sale **needs delivery** when:

```
shipping_method ∈ { MOTOBOY, CORREIOS, TRANSPORTADORA }
  OR channel ∈ { ONLINE, WHATSAPP }
```

`RETIRADA` (in-store pickup) is **excluded** from v1.

This predicate lives in one pure function (`isDeliverableSale(sale)`) so the API,
tests, and any future job share it.

The list view = qualifying **Sales** left-joined to their `Delivery`. When no
`Delivery` row exists yet, the UI shows status **PENDING**. The row is
**upserted** (by `sale_id`) the first time an operator changes status or saves
details. This keeps the sale-creation path untouched and needs no migration
backfill.

## 3. Backend API

All routes guard with `getSession()` (401 if absent), validate input with Zod
(400 on failure), handle errors explicitly (no silent catches), and return a
consistent `{ error }` envelope on failure.

### `GET /api/deliveries`
- Returns qualifying sales joined with `delivery`, `customer`, and item count.
- Query params: `status` (filter; `PENDING` matches sales with no Delivery row or
  an explicit PENDING row), `q` (search by recipient/customer name or phone).
- Normalized row shape:
  ```ts
  {
    saleId, deliveryId, status, carrier,
    customerName, phone, address, cep,
    total, fee, trackingCode, trackingUrl,
    driverName, driverPhone, channel, shippingMethod, createdAt
  }
  ```

### `PATCH /api/deliveries/[saleId]`
- Upserts the `Delivery` for that sale.
- Body (all optional): `status`, `carrier`, `trackingCode`, `trackingUrl`,
  `driverName`, `driverPhone`, `fee`, `recipientName`, `recipientPhone`,
  `address`, `cep`, `notes`.
- On status transition: sets `dispatched_at` when entering `DISPATCHED`,
  `delivered_at` when entering `DELIVERED`.
- Validates the transition with `canTransition(from, to)` (see §4 helper).
- When seeding a new Delivery, defaults `recipient_*`/`address`/`cep`/`fee` from
  the sale + customer.

### `POST /api/deliveries/[saleId]/notify`
- Sends a manual WhatsApp message to the recipient via the existing Evolution API
  lib.
- Body: `{ message: string }` (operator-edited preview) — server validates
  non-empty and length-caps it.
- Recipient number resolution: `recipient_phone` → `customer.whatsapp` →
  `customer.phone`. 400 if none available.

## 4. Carrier adapter layer — `src/lib/delivery/`

Provider-agnostic so external couriers slot in without UI/API rework.

- `types.ts`
  - `DeliveryCarrier` interface:
    `quote(input) / dispatch(input) / getStatus(externalId) / cancel(externalId)`.
  - All return `{ success: boolean; data?: T; error?: string }`.
  - Pure status helpers also live here:
    - `isDeliverableSale(sale): boolean`
    - `canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean`
    - `buildStatusMessage(kind, ctx): string` (pt-BR message builders)
- `manual.ts` — operator-handled carrier. `dispatch()` is a no-op success;
  `getStatus()` echoes the stored status. **Default + only live carrier in v1.**
- `ninetynine.ts` — **99 CORP API adapter stub**. Every method returns
  `{ success: false, error: "Integração 99 não configurada." }`. The real
  contract is documented inline as TODO for when a 99 Empresas contract exists:
  - `GET /rides/estimate/{employeeId}` (quote)
  - `POST /rides` with `delivery99` / `delivery-moto99` category + `receiver.name`
    / `receiver.phone`
  - Auth header `x-api-key`
  - Webhook for status + driver location
  - Base URL `https://api-corp.99app.com/v2`
- `index.ts` — `getCarrier(name): DeliveryCarrier` factory (defaults to manual).

The `PATCH` endpoint may call `carrier.dispatch()` when `carrier !== "MANUAL"`;
since only MANUAL is live, that branch is currently inert but proven by the
factory.

## 5. Frontend — `src/app/entregas/page.tsx`

Client component, matching the existing `tables` / `exchanges` dark theme
(rounded-2xl cards, `brand-green` accent, slate surfaces).

- **Header:** title "Entregas", count summary, refresh button.
- **Status filter pills:** Pendentes / Saiu p/ entrega / Entregues / Falhas /
  Todas.
- **Search:** by customer/recipient name or phone.
- **List:** cards showing customer, address, status badge, carrier, total/fee,
  date. Loading skeleton (consistent with the dashboard skeleton) + empty state.
- **Row actions:**
  - Advance-status quick buttons (respecting `canTransition`).
  - **Detalhes modal:** edit carrier, tracking code/url, driver name/phone, fee,
    recipient, notes.
  - **WhatsApp button:** opens an editable message preview, then
    `POST .../notify`; shows success/failure.
- **Sidebar:** add `{ href: "/entregas", label: "Entregas", icon: Truck,
  adminOnly: false }` near "Mesas" (operators manage deliveries).

## 6. Notifications

Manual only. Pre-filled, editable pt-BR messages, e.g.:
- Dispatched: *"Olá {nome}! Seu pedido saiu para entrega 🛵 e chega em breve."*
- Delivered: *"Olá {nome}! Seu pedido foi entregue ✅. Obrigado pela preferência!"*

Operator edits before sending. Reuses the Evolution API send path.

## 7. Error handling & validation

- Every API route: `getSession` guard, Zod validation, explicit error handling,
  user-friendly `{ error }` messages — consistent with the recent hardening pass.
- Frontend: visible loading / empty / error states; WhatsApp send reports
  success or failure.

## 8. Testing

- **Unit (highest signal):** `isDeliverableSale`, `canTransition`,
  `buildStatusMessage`, and the `getCarrier` factory.
- **E2E (Playwright smoke):** `/entregas` loads, renders the list, and filters by
  status. Matches the existing `tests/` setup.

## 9. Migration

The new `Delivery` model + `DeliveryStatus` enum require `npm run db:push`
against the **direct** Supabase URL (port 5432, not pgbouncer) per `CLAUDE.md`.
Flagged at the appropriate step; run by the user (or a generated migration file).
No backfill needed (lazy upsert, §2).

## Out of scope (v1 — YAGNI)

- Automatic status-change notifications.
- Real external carrier API calls (99/Correios live integration).
- Pickup (RETIRADA) "ready for pickup" tracking.
- Delivery analytics / reports.
- Pagination on the list (small per-store volume; add when needed).

These all build cleanly on this foundation later.
