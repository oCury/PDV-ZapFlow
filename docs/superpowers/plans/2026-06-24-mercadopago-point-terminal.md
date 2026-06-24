# Mercado Pago Point Smart Terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge credit, debit, and PIX directly on the Mercado Pago Point Smart terminal from the PDV, with operator-chosen installments, across many terminals, in production.

**Architecture:** A DB-backed terminal registry (`PaymentTerminal`) and an in-flight charge record (`TerminalCharge`) decouple the terminal transaction lifecycle from the finalized `Sale`. The PDV creates a charge → a typed Mercado Pago Orders client sends it to the device → the result returns via webhook (source of truth) with polling as a UX fallback → both converge on a single idempotent `finalizeCharge()` that sets the sale, records the payment, and decrements stock exactly once.

**Tech Stack:** Next.js 15 (App Router), Prisma 6 + PostgreSQL (Supabase), Zod 4, Mercado Pago Orders API (point flow), Vitest (new, unit/integration), Playwright (existing, e2e).

**Spec:** `docs/superpowers/specs/2026-06-24-mercadopago-point-terminal-design.md`

---

## Deviations from the approved spec (read before starting)

Three refinements surfaced while inspecting the real code. **#2 needs your explicit OK** — the others are factual corrections.

1. **`StoreSettings.max_installments` is a key-value row, not a column.** `StoreSettings` is a generic key/value table (`key`, `value`). So the installment ceiling is stored as a row `{ key: "max_installments", value: "6" }` and read through the existing `/api/settings` route — not a new Prisma column.
2. **Typed REST wrappers instead of the `mercadopago` SDK.** The spec locked "use the official SDK," but the SDK's point-Orders method surface is unverified, the codebase already calls MP via `fetch`, and `fetch` mocks make the idempotency/route tests trivial. This plan implements small typed `fetch` wrappers in `src/lib/mercadopago/`. **If you'd rather use the SDK, say so and I'll swap Phase 2.**
3. **`finalizeCharge` v1 = status + stock + `SalePayment`; loyalty award deferred.** The current card flow (create-intent → webhook) does not award loyalty points either, and the loyalty logic lives inside the 371-line `POST /api/sales` route. Replicating it would either duplicate logic or require a larger refactor. v1 keeps parity-plus (it adds the missing `SalePayment` record); loyalty-on-terminal-sale is noted as a follow-up.

---

## Prerequisites (one-time, before Task 1)

- You are on branch `feat/mercadopago-terminal` (already created off `origin/main`).
- `.env` has a **production** `MERCADOPAGO_ACCESS_TOKEN` and `MERCADOPAGO_WEBHOOK_SECRET`. For local dev against MP, a **test** access token also works for the Orders simulator.
- `prisma db push` needs the **direct** Supabase connection (port 5432), not pgbouncer (6543). Temporarily swap `DATABASE_URL` in `.env` to the direct URL when running `db:push`, then swap back. (Project convention — see `CLAUDE.md`.)
- The MP application must carry the **"PointdeMercadoPago"** product and have `notification_url` configured at the app level in the MP dashboard (point to `https://<host>/api/webhooks/mercadopago`).

---

## Phase 0 — Tooling: add Vitest

### Task 0: Install and configure Vitest

**Files:**
- Modify: `package.json` (devDeps + scripts)
- Create: `vitest.config.ts`
- Create: `src/lib/mercadopago/__tests__/smoke.test.ts` (temporary, deleted at end of task)

- [ ] **Step 1: Install Vitest**

Run:
```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Add the `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block add:
```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
```

- [ ] **Step 4: Write a smoke test**

`src/lib/mercadopago/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm src/lib/mercadopago/__tests__/smoke.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit/integration tests"
```

---

## Phase 1 — Schema + migration

### Task 1: Add terminal models and extend payment models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the new enums and models** (place after the `SalePayment` model, ~line 269)

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

model PaymentTerminal {
  id             String                @id @default(cuid())
  name           String
  mp_device_id   String                @unique
  operating_mode TerminalOperatingMode @default(PDV)
  status         TerminalStatus        @default(UNKNOWN)
  location_label String?
  is_active      Boolean               @default(true)
  last_seen_at   DateTime?
  created_at     DateTime              @default(now())

  charges TerminalCharge[]

  @@index([is_active])
  @@map("payment_terminals")
}

model TerminalCharge {
  id            String               @id @default(cuid())
  sale_id       String?
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

  terminal PaymentTerminal @relation(fields: [terminal_id], references: [id])
  sale     Sale?           @relation(fields: [sale_id], references: [id])

  @@index([terminal_id])
  @@index([sale_id])
  @@index([status])
  @@map("terminal_charges")
}
```

- [ ] **Step 2: Extend `SalePayment`** (add four fields before the closing `}` of the model, after the `created_at` line)

```prisma
  terminal_charge_id String?
  installments       Int?
  card_brand         String?
  mp_payment_id      String?
```

- [ ] **Step 3: Add the back-relation to `Sale`** (in the `model Sale` relations block, after `voucher_usages   VoucherUsage[]`)

```prisma
  terminal_charges TerminalCharge[]
```

- [ ] **Step 4: Validate the schema**

Run: `npx --package=prisma@6 prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 5: Push to the database** (swap `DATABASE_URL` to the direct 5432 URL first, per Prerequisites)

Run: `npm run db:push`
Expected: tables `payment_terminals`, `terminal_charges` created; `sale_payments` altered. Swap `DATABASE_URL` back to pgbouncer afterward.

- [ ] **Step 6: Regenerate the client and commit**

```bash
npm run db:generate
git add prisma/schema.prisma
git commit -m "feat: schema for payment terminals and terminal charges"
```

---

## Phase 2 — Mercado Pago Orders client (typed REST modules)

### Task 2: Confirm the MP Orders point contract

**Files:**
- Create: `docs/superpowers/specs/mp-orders-point-contract.md`

- [ ] **Step 1: Verify the live contract.** Using the Context7 docs MCP (`developers.mercadopago.com`) or the MP dashboard, confirm and record, in the contract file, the exact: create-order endpoint and body for a **point** order (card vs PIX), the get-order and cancel-order endpoints, the webhook **topic/type** string for orders, and the simulator endpoint. Capture exact field names (`type`, `config.point.terminal_id`, `transactions.payments[].payment_method.type`, `installments`, `total_amount` format).

- [ ] **Step 2: Commit the contract**

```bash
git add docs/superpowers/specs/mp-orders-point-contract.md
git commit -m "docs: pin Mercado Pago Orders point API contract"
```

> The code in Tasks 3–4 is written against the best-known contract (below). If Step 1 reveals a different field name, adjust the code in those tasks to match the contract doc — the structure stays the same.

### Task 3: Money + payload helpers (pure, TDD)

**Files:**
- Create: `src/lib/mercadopago/amount.ts`
- Test: `src/lib/mercadopago/amount.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { toAmountString, methodToMpType, validateInstallments } from "./amount";

describe("toAmountString", () => {
  it("formats reais with two decimals", () => {
    expect(toAmountString(12.3)).toBe("12.30");
    expect(toAmountString(1)).toBe("1.00");
    expect(toAmountString(199.999)).toBe("200.00");
  });
});

describe("methodToMpType", () => {
  it("maps charge methods to MP payment-method types", () => {
    expect(methodToMpType("CREDIT")).toBe("credit_card");
    expect(methodToMpType("DEBIT")).toBe("debit_card");
    expect(methodToMpType("PIX")).toBe("pix");
  });
});

describe("validateInstallments", () => {
  it("accepts 1 installment for any amount", () => {
    expect(validateInstallments(10, 1, 12)).toEqual({ ok: true });
  });
  it("rejects installments above the store max", () => {
    expect(validateInstallments(100, 7, 6)).toEqual({
      ok: false,
      reason: "MAX_EXCEEDED",
    });
  });
  it("rejects when a parcela would fall below R$5,00", () => {
    expect(validateInstallments(12, 3, 6)).toEqual({
      ok: false,
      reason: "MIN_PARCELA",
    });
  });
  it("accepts when each parcela is at least R$5,00", () => {
    expect(validateInstallments(15, 3, 6)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- amount`
Expected: FAIL ("Cannot find module './amount'").

- [ ] **Step 3: Implement**

`src/lib/mercadopago/amount.ts`:
```ts
import type { TerminalChargeMethod } from "@prisma/client";

/** Min installment value enforced by Mercado Pago: R$5,00. */
export const MIN_INSTALLMENT_VALUE = 5;

/** Reais number → MP decimal string, e.g. 12.3 → "12.30". */
export function toAmountString(reais: number): string {
  return (Math.round(reais * 100) / 100).toFixed(2);
}

export function methodToMpType(
  method: TerminalChargeMethod
): "credit_card" | "debit_card" | "pix" {
  switch (method) {
    case "CREDIT":
      return "credit_card";
    case "DEBIT":
      return "debit_card";
    case "PIX":
      return "pix";
  }
}

export type InstallmentCheck =
  | { ok: true }
  | { ok: false; reason: "MAX_EXCEEDED" | "MIN_PARCELA" };

export function validateInstallments(
  amount: number,
  installments: number,
  maxInstallments: number
): InstallmentCheck {
  if (installments < 1) return { ok: false, reason: "MIN_PARCELA" };
  if (installments > maxInstallments) return { ok: false, reason: "MAX_EXCEEDED" };
  if (installments > 1 && amount / installments < MIN_INSTALLMENT_VALUE) {
    return { ok: false, reason: "MIN_PARCELA" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- amount`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mercadopago/amount.ts src/lib/mercadopago/amount.test.ts
git commit -m "feat: MP amount/method/installment helpers"
```

### Task 4: Orders client + devices + error mapper

**Files:**
- Create: `src/lib/mercadopago/client.ts`
- Create: `src/lib/mercadopago/errors.ts`
- Create: `src/lib/mercadopago/orders.ts`
- Create: `src/lib/mercadopago/devices.ts`
- Test: `src/lib/mercadopago/errors.test.ts`
- Test: `src/lib/mercadopago/orders.test.ts`

- [ ] **Step 1: Implement the shared client**

`src/lib/mercadopago/client.ts`:
```ts
export const MP_BASE_URL = "https://api.mercadopago.com";

export function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured");
  return token;
}

export class MpApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`Mercado Pago API ${status}: ${body}`);
    this.name = "MpApiError";
  }
}

export async function mpFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<unknown> {
  const { idempotencyKey, headers, ...rest } = init;
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    throw new MpApiError(res.status, await res.text());
  }
  return res.json();
}
```

- [ ] **Step 2: Write the failing error-mapper test**

`src/lib/mercadopago/errors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapMpErrorToOperatorMessage } from "./errors";
import { MpApiError } from "./client";

describe("mapMpErrorToOperatorMessage", () => {
  it("maps 409 to device-busy message", () => {
    const m = mapMpErrorToOperatorMessage(new MpApiError(409, "queued"));
    expect(m.code).toBe("DEVICE_BUSY");
    expect(m.message).toMatch(/ocupada/i);
  });
  it("maps 403 to integrator-not-registered config error", () => {
    const m = mapMpErrorToOperatorMessage(new MpApiError(403, "x"));
    expect(m.code).toBe("CONFIG");
  });
  it("maps network errors to offline", () => {
    const m = mapMpErrorToOperatorMessage(new TypeError("fetch failed"));
    expect(m.code).toBe("OFFLINE");
  });
  it("falls back to generic", () => {
    const m = mapMpErrorToOperatorMessage(new MpApiError(500, "boom"));
    expect(m.code).toBe("GENERIC");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- errors`
Expected: FAIL ("Cannot find module './errors'").

- [ ] **Step 4: Implement the error mapper**

`src/lib/mercadopago/errors.ts`:
```ts
import { MpApiError } from "./client";

export type OperatorError = {
  code: "DEVICE_BUSY" | "OFFLINE" | "DECLINED" | "CONFIG" | "GENERIC";
  message: string;
};

export function mapMpErrorToOperatorMessage(err: unknown): OperatorError {
  if (err instanceof MpApiError) {
    if (err.status === 409)
      return { code: "DEVICE_BUSY", message: "Maquininha ocupada — cancele a cobrança anterior." };
    if (err.status === 403)
      return { code: "CONFIG", message: "Configuração do Mercado Pago inválida. Verifique o app/integração." };
    if (err.status === 400)
      return { code: "GENERIC", message: "Dados da cobrança inválidos." };
    return { code: "GENERIC", message: "Erro ao comunicar com a maquininha. Tente novamente." };
  }
  // fetch network failures throw TypeError
  return { code: "OFFLINE", message: "Maquininha sem conexão. Verifique a internet do dispositivo." };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- errors`
Expected: PASS.

- [ ] **Step 6: Write the failing orders test** (mocks `mpFetch`)

`src/lib/mercadopago/orders.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return { ...actual, mpFetch: vi.fn() };
});

import { mpFetch } from "./client";
import { createTerminalOrder, getOrder, cancelOrder } from "./orders";

const mpFetchMock = mpFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mpFetchMock.mockReset());

describe("createTerminalOrder", () => {
  it("POSTs a point order with the device terminal_id, decimal amount and installments", async () => {
    mpFetchMock.mockResolvedValue({ id: "ord_1" });
    const res = await createTerminalOrder({
      terminalDeviceId: "DEV123",
      amount: 99.9,
      method: "CREDIT",
      installments: 3,
      externalRef: "chg_1",
    });
    expect(res.id).toBe("ord_1");
    const [path, init] = mpFetchMock.mock.calls[0];
    expect(path).toBe("/v1/orders");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("point");
    expect(body.external_reference).toBe("chg_1");
    expect(body.total_amount).toBe("99.90");
    expect(body.config.point.terminal_id).toBe("DEV123");
    expect(body.transactions.payments[0].payment_method.type).toBe("credit_card");
    expect(body.transactions.payments[0].payment_method.installments).toBe(3);
    expect(init.idempotencyKey).toBe("chg_1");
  });
});

describe("getOrder / cancelOrder", () => {
  it("GETs the order by id", async () => {
    mpFetchMock.mockResolvedValue({ id: "ord_1", status: "processed" });
    const o = await getOrder("ord_1");
    expect(o.status).toBe("processed");
    expect(mpFetchMock.mock.calls[0][0]).toBe("/v1/orders/ord_1");
  });
  it("cancels the order by id", async () => {
    mpFetchMock.mockResolvedValue({ id: "ord_1", status: "canceled" });
    await cancelOrder("ord_1");
    expect(mpFetchMock.mock.calls[0][0]).toBe("/v1/orders/ord_1/cancel");
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `npm test -- orders`
Expected: FAIL ("Cannot find module './orders'").

- [ ] **Step 8: Implement `orders.ts`** (reconcile field names with the contract doc from Task 2)

```ts
import { mpFetch } from "./client";
import { toAmountString, methodToMpType } from "./amount";
import type { TerminalChargeMethod } from "@prisma/client";

export interface CreateTerminalOrderInput {
  terminalDeviceId: string;
  amount: number;
  method: TerminalChargeMethod;
  installments: number;
  externalRef: string;
}

export interface MpOrder {
  id: string;
  status?: string;
  status_detail?: string;
  transactions?: { payments?: { id?: string; status?: string }[] };
}

export async function createTerminalOrder(
  input: CreateTerminalOrderInput
): Promise<MpOrder> {
  const amount = toAmountString(input.amount);
  const body = {
    type: "point",
    external_reference: input.externalRef,
    total_amount: amount,
    config: { point: { terminal_id: input.terminalDeviceId, print_on_terminal: true } },
    transactions: {
      payments: [
        {
          amount,
          payment_method: {
            type: methodToMpType(input.method),
            ...(input.method === "CREDIT" ? { installments: input.installments } : {}),
          },
        },
      ],
    },
  };
  return (await mpFetch("/v1/orders", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: input.externalRef,
  })) as MpOrder;
}

export async function getOrder(orderId: string): Promise<MpOrder> {
  return (await mpFetch(`/v1/orders/${orderId}`)) as MpOrder;
}

export async function cancelOrder(orderId: string): Promise<MpOrder> {
  return (await mpFetch(`/v1/orders/${orderId}/cancel`, { method: "POST" })) as MpOrder;
}
```

- [ ] **Step 9: Implement `devices.ts`**

```ts
import { mpFetch } from "./client";

export interface MpDevice {
  id: string;
  operating_mode?: string;
}

export async function listDevices(): Promise<MpDevice[]> {
  const res = (await mpFetch("/point/integration-api/devices")) as {
    devices?: MpDevice[];
  };
  return res.devices ?? [];
}

export async function setOperatingMode(
  deviceId: string,
  mode: "PDV" | "STANDALONE"
): Promise<void> {
  await mpFetch(`/point/integration-api/devices/${deviceId}`, {
    method: "PATCH",
    body: JSON.stringify({ operating_mode: mode }),
  });
}
```

- [ ] **Step 10: Run all MP lib tests**

Run: `npm test -- mercadopago`
Expected: PASS (amount, errors, orders).

- [ ] **Step 11: Commit**

```bash
git add src/lib/mercadopago/
git commit -m "feat: typed Mercado Pago Orders + devices client with error mapping"
```

---

## Phase 3 — Idempotent finalization

### Task 5: `finalizeCharge` (TDD, the correctness core)

**Files:**
- Create: `src/lib/mercadopago/finalize.ts`
- Test: `src/lib/mercadopago/finalize.test.ts`

The function maps a resolved MP order to our DB: it is keyed by `mp_order_id`, runs in a transaction, and is a **no-op if already finalized** (so webhook + poll never double-apply).

- [ ] **Step 1: Write the failing test** (mocks `@/lib/prisma`)

`src/lib/mercadopago/finalize.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = {
  terminalCharge: { update: vi.fn() },
  sale: { update: vi.fn() },
  salePayment: { create: vi.fn() },
  productVariant: { update: vi.fn() },
  product: { update: vi.fn() },
};
const prismaMock = {
  terminalCharge: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { finalizeCharge } from "./finalize";

beforeEach(() => {
  vi.clearAllMocks();
});

function charge(overrides = {}) {
  return {
    id: "chg_1",
    mp_order_id: "ord_1",
    sale_id: "sale_1",
    amount: 100,
    method: "CREDIT",
    installments: 3,
    status: "SENT",
    sale: {
      id: "sale_1",
      status: "PENDING",
      items: [
        { product_id: "p1", variant_id: "v1", quantity: 2 },
        { product_id: "p2", variant_id: null, quantity: 1 },
      ],
    },
    ...overrides,
  };
}

describe("finalizeCharge", () => {
  it("approves the sale, records payment, decrements variant- and product-level stock", async () => {
    prismaMock.terminalCharge.findUnique.mockResolvedValue(charge());
    await finalizeCharge("ord_1", { status: "approved", paymentId: "pay_9", cardBrand: "visa" });

    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sale_1" }, data: { status: "APPROVED" } })
    );
    expect(tx.salePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sale_id: "sale_1",
          payment_method: "CARD",
          amount: 100,
          installments: 3,
          card_brand: "visa",
          mp_payment_id: "pay_9",
          terminal_charge_id: "chg_1",
        }),
      })
    );
    expect(tx.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "v1" }, data: { stock_quantity: { decrement: 2 } } })
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p2" }, data: { stock_quantity: { decrement: 1 } } })
    );
  });

  it("is a no-op when the charge is already APPROVED (idempotent)", async () => {
    prismaMock.terminalCharge.findUnique.mockResolvedValue(charge({ status: "APPROVED" }));
    await finalizeCharge("ord_1", { status: "approved", paymentId: "pay_9" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("marks the charge DECLINED without touching stock when not approved", async () => {
    prismaMock.terminalCharge.findUnique.mockResolvedValue(charge());
    await finalizeCharge("ord_1", { status: "rejected", paymentId: "pay_9" });
    expect(tx.terminalCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DECLINED" }) })
    );
    expect(tx.sale.update).not.toHaveBeenCalled();
    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });

  it("does nothing when the order id is unknown", async () => {
    prismaMock.terminalCharge.findUnique.mockResolvedValue(null);
    await finalizeCharge("ord_unknown", { status: "approved", paymentId: "x" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("maps PIX charges to the PIX payment method", async () => {
    prismaMock.terminalCharge.findUnique.mockResolvedValue(charge({ method: "PIX", installments: 1 }));
    await finalizeCharge("ord_1", { status: "approved", paymentId: "pay_9" });
    expect(tx.salePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payment_method: "PIX" }) })
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- finalize`
Expected: FAIL ("Cannot find module './finalize'").

- [ ] **Step 3: Implement `finalize.ts`**

```ts
import { prisma } from "@/lib/prisma";
import type { TerminalChargeMethod } from "@prisma/client";

export interface FinalizeInput {
  status: string; // MP payment/order status, e.g. "approved" | "rejected"
  paymentId: string;
  cardBrand?: string;
}

const APPROVED_STATES = new Set(["approved", "processed"]);
const TERMINAL_STATES = new Set(["APPROVED", "DECLINED", "CANCELED", "ERROR", "EXPIRED"]);

function chargeMethodToPaymentMethod(method: TerminalChargeMethod): "CARD" | "PIX" {
  return method === "PIX" ? "PIX" : "CARD";
}

/**
 * Idempotently reconcile a resolved MP order into our DB.
 * Safe to call from both the webhook and the polling fallback — keyed by mp_order_id,
 * a no-op once the charge has reached a terminal state.
 */
export async function finalizeCharge(orderId: string, input: FinalizeInput): Promise<void> {
  const charge = await prisma.terminalCharge.findUnique({
    where: { mp_order_id: orderId },
    include: { sale: { include: { items: true } } },
  });

  if (!charge) return; // unknown order — nothing to do
  if (TERMINAL_STATES.has(charge.status)) return; // already finalized — idempotent no-op

  const approved = APPROVED_STATES.has(input.status.toLowerCase());

  if (!approved) {
    await prisma.terminalCharge.update({
      where: { id: charge.id },
      data: {
        status: "DECLINED",
        mp_payment_id: input.paymentId,
        error_code: input.status,
        resolved_at: new Date(),
      },
    });
    return;
  }

  const sale = charge.sale;
  await prisma.$transaction(async (tx) => {
    await tx.terminalCharge.update({
      where: { id: charge.id },
      data: { status: "APPROVED", mp_payment_id: input.paymentId, resolved_at: new Date() },
    });

    if (sale) {
      await tx.sale.update({ where: { id: sale.id }, data: { status: "APPROVED" } });

      await tx.salePayment.create({
        data: {
          sale_id: sale.id,
          payment_method: chargeMethodToPaymentMethod(charge.method),
          amount: charge.amount,
          installments: charge.installments,
          card_brand: input.cardBrand ?? null,
          mp_payment_id: input.paymentId,
          terminal_charge_id: charge.id,
        },
      });

      for (const item of sale.items) {
        if (item.variant_id) {
          await tx.productVariant.update({
            where: { id: item.variant_id },
            data: { stock_quantity: { decrement: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.product_id },
            data: { stock_quantity: { decrement: item.quantity } },
          });
        }
      }
    }
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- finalize`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mercadopago/finalize.ts src/lib/mercadopago/finalize.test.ts
git commit -m "feat: idempotent finalizeCharge reconciliation"
```

---

## Phase 4 — Terminal management routes + settings UI

### Task 6: Terminal registry API

**Files:**
- Create: `src/app/api/terminals/route.ts` (GET list)
- Create: `src/app/api/terminals/sync/route.ts` (POST sync from MP)
- Create: `src/app/api/terminals/[id]/route.ts` (PATCH)
- Create: `src/lib/validations/terminal.ts`

- [ ] **Step 1: Validation schema** — `src/lib/validations/terminal.ts`:
```ts
import { z } from "zod";

export const updateTerminalSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  is_active: z.boolean().optional(),
  location_label: z.string().max(60).nullable().optional(),
});

export const terminalChargeSchema = z.object({
  terminalId: z.string().min(1),
  method: z.enum(["CREDIT", "DEBIT", "PIX"]),
  installments: z.number().int().positive().default(1),
  totalAmount: z.number().positive(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().optional(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  customerId: z.string().optional(),
});
```

- [ ] **Step 2: GET list** — `src/app/api/terminals/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const terminals = await prisma.paymentTerminal.findMany({
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json({ terminals });
}
```

- [ ] **Step 3: POST sync** — `src/app/api/terminals/sync/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listDevices, setOperatingMode } from "@/lib/mercadopago/devices";
import { mapMpErrorToOperatorMessage } from "@/lib/mercadopago/errors";

export async function POST() {
  try {
    const devices = await listDevices();
    for (const device of devices) {
      await setOperatingMode(device.id, "PDV").catch(() => {});
      await prisma.paymentTerminal.upsert({
        where: { mp_device_id: device.id },
        update: { operating_mode: "PDV", last_seen_at: new Date(), status: "ONLINE" },
        create: { name: device.id, mp_device_id: device.id, operating_mode: "PDV", status: "ONLINE" },
      });
    }
    const terminals = await prisma.paymentTerminal.findMany({ orderBy: { created_at: "asc" } });
    return NextResponse.json({ synced: devices.length, terminals });
  } catch (err) {
    const op = mapMpErrorToOperatorMessage(err);
    return NextResponse.json({ error: op.message, code: op.code }, { status: 502 });
  }
}
```

- [ ] **Step 4: PATCH** — `src/app/api/terminals/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateTerminalSchema } from "@/lib/validations/terminal";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = updateTerminalSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const terminal = await prisma.paymentTerminal.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ terminal });
}
```

- [ ] **Step 5: Manual verify**

Run: `npm run dev`, then `curl -s localhost:3000/api/terminals`
Expected: `{"terminals":[]}` (empty before first sync).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/terminals src/lib/validations/terminal.ts
git commit -m "feat: terminal registry API (list/sync/update)"
```

### Task 7: Terminals settings page

**Files:**
- Create: `src/app/settings/terminals/page.tsx`
- Modify: `src/app/settings/page.tsx` (add a link/card to the terminals page)

- [ ] **Step 1: Build the page** — `src/app/settings/terminals/page.tsx`. Follow the dark theme used elsewhere (`bg-primary-dark`, `text-brand-green`, `bg-slate-800`, `min-h-[44px]` touch targets). Provides: a "Sincronizar dispositivos" button calling `POST /api/terminals/sync`; a list of terminals with a status badge; and a "Teste de cobrança R$1,00" button per terminal (gated behind a confirm dialog).

```tsx
"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CreditCard } from "lucide-react";

interface Terminal {
  id: string;
  name: string;
  mp_device_id: string;
  status: "ONLINE" | "OFFLINE" | "BUSY" | "UNKNOWN";
  location_label: string | null;
  is_active: boolean;
}

const STATUS_STYLE: Record<Terminal["status"], string> = {
  ONLINE: "bg-brand-green/20 text-brand-green",
  OFFLINE: "bg-red-500/20 text-red-400",
  BUSY: "bg-amber-500/20 text-amber-400",
  UNKNOWN: "bg-slate-600 text-slate-300",
};

export default function TerminalsSettingsPage() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/terminals");
    if (res.ok) setTerminals((await res.json()).terminals);
  }
  useEffect(() => { load(); }, []);

  async function sync() {
    setSyncing(true);
    setError(null);
    const res = await fetch("/api/terminals/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Falha ao sincronizar.");
    else setTerminals(data.terminals);
    setSyncing(false);
  }

  return (
    <main className="min-h-screen bg-primary-dark text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Maquininhas</h1>
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            className="touch-target min-h-[44px] px-4 flex items-center gap-2 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold disabled:opacity-60"
          >
            <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
            Sincronizar dispositivos
          </button>
        </header>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {terminals.length === 0 ? (
          <p className="text-slate-400">
            Nenhuma maquininha vinculada. Conecte o dispositivo à conta Mercado Pago e clique em
            "Sincronizar dispositivos".
          </p>
        ) : (
          <ul className="space-y-3">
            {terminals.map((t) => (
              <li key={t.id} className="p-4 rounded-2xl bg-slate-800 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{t.mp_device_id}</p>
                    {t.location_label && (
                      <p className="text-xs text-slate-400">{t.location_label}</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${STATUS_STYLE[t.status]}`}>
                    {t.status}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Cobrar R$1,00 de teste em ${t.name}?`)) return;
                      const res = await fetch("/api/checkout/terminal-charge", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          terminalId: t.id,
                          method: "DEBIT",
                          installments: 1,
                          totalAmount: 1,
                          items: [{ productId: "TEST", quantity: 1, unitPrice: 1 }],
                        }),
                      });
                      if (!res.ok) {
                        const d = await res.json();
                        alert(d.error || "Falha no teste.");
                      } else {
                        alert("Cobrança enviada à maquininha. Conclua no dispositivo.");
                      }
                    }}
                    className="touch-target min-h-[40px] px-3 flex items-center gap-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm"
                  >
                    <CreditCard size={16} />
                    Teste de cobrança R$1,00
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
```

> Note: the "Teste de cobrança" uses a `productId: "TEST"` sentinel. Because `finalizeCharge` only decrements stock when the order is approved and the sale has items referencing real products, the test sale references a non-existent product — its purpose is to confirm the device receives the intent, not to complete a real sale. (A dedicated `dry-run` that creates the order without a Sale is a clean follow-up; left out to keep this task focused.)

- [ ] **Step 2: Link from settings** — in `src/app/settings/page.tsx`, add a navigation card/link to `/settings/terminals` matching the existing settings layout.

- [ ] **Step 3: Manual verify**

Run: `npm run dev`, open `/settings/terminals`. With MP creds set and a paired device, click "Sincronizar dispositivos" → the device appears with a status badge.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/terminals/page.tsx src/app/settings/page.tsx
git commit -m "feat: terminals settings page (sync, list, test charge)"
```

---

## Phase 5 — Terminal-charge routes

### Task 8: Create / status / cancel charge

**Files:**
- Create: `src/app/api/checkout/terminal-charge/route.ts` (POST)
- Create: `src/app/api/checkout/terminal-charge/[id]/route.ts` (GET status)
- Create: `src/app/api/checkout/terminal-charge/[id]/cancel/route.ts` (POST)
- Create: `src/lib/settings.ts` (read `max_installments` from key-value settings)
- Test: `src/app/api/checkout/terminal-charge/route.test.ts`

- [ ] **Step 1: Settings helper** — `src/lib/settings.ts`:
```ts
import { prisma } from "@/lib/prisma";

export async function getMaxInstallments(): Promise<number> {
  const row = await prisma.storeSettings.findUnique({ where: { key: "max_installments" } });
  const n = row ? parseInt(row.value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
```

- [ ] **Step 2: POST create charge** — `src/app/api/checkout/terminal-charge/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { terminalChargeSchema } from "@/lib/validations/terminal";
import { getMaxInstallments } from "@/lib/settings";
import { validateInstallments } from "@/lib/mercadopago/amount";
import { createTerminalOrder } from "@/lib/mercadopago/orders";
import { mapMpErrorToOperatorMessage } from "@/lib/mercadopago/errors";

export async function POST(req: Request) {
  const parsed = terminalChargeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados da cobrança inválidos" }, { status: 400 });
  }
  const { terminalId, method, installments, totalAmount, items, customerId } = parsed.data;

  const terminal = await prisma.paymentTerminal.findUnique({ where: { id: terminalId } });
  if (!terminal || !terminal.is_active) {
    return NextResponse.json({ error: "Maquininha não encontrada ou inativa" }, { status: 404 });
  }

  if (method === "CREDIT") {
    const max = await getMaxInstallments();
    const check = validateInstallments(totalAmount, installments, max);
    if (!check.ok) {
      const msg =
        check.reason === "MIN_PARCELA"
          ? "Cada parcela deve ser de no mínimo R$5,00."
          : `Máximo de ${max}x permitido.`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // One active charge per terminal
  const active = await prisma.terminalCharge.findFirst({
    where: { terminal_id: terminalId, status: { in: ["CREATED", "SENT", "PROCESSING"] } },
  });
  if (active) {
    return NextResponse.json(
      { error: "Maquininha ocupada — cancele a cobrança anterior.", code: "DEVICE_BUSY" },
      { status: 409 }
    );
  }

  // Create the pending sale (mirrors create-intent, with variant + customer)
  const sale = await prisma.sale.create({
    data: {
      total_amount: totalAmount,
      payment_method: method === "PIX" ? "PIX" : "CARD",
      status: "PENDING",
      customer_id: customerId,
      items: {
        create: items.map((i) => ({
          product_id: i.productId,
          variant_id: i.variantId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
        })),
      },
    },
  });

  // Reserve the charge row first; mp_order_id is filled after the order is created
  const charge = await prisma.terminalCharge.create({
    data: {
      sale_id: sale.id,
      terminal_id: terminalId,
      mp_order_id: `pending_${sale.id}`,
      amount: totalAmount,
      method,
      installments: method === "CREDIT" ? installments : 1,
      status: "CREATED",
    },
  });

  try {
    const order = await createTerminalOrder({
      terminalDeviceId: terminal.mp_device_id,
      amount: totalAmount,
      method,
      installments,
      externalRef: charge.id,
    });
    const updated = await prisma.terminalCharge.update({
      where: { id: charge.id },
      data: { mp_order_id: order.id, status: "SENT" },
    });
    return NextResponse.json({ chargeId: updated.id, status: updated.status });
  } catch (err) {
    await prisma.terminalCharge.update({
      where: { id: charge.id },
      data: { status: "ERROR", error_code: "CREATE_FAILED" },
    });
    await prisma.sale.delete({ where: { id: sale.id } });
    const op = mapMpErrorToOperatorMessage(err);
    return NextResponse.json({ error: op.message, code: op.code }, { status: 502 });
  }
}
```

- [ ] **Step 3: GET status** — `src/app/api/checkout/terminal-charge/[id]/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrder } from "@/lib/mercadopago/orders";
import { finalizeCharge } from "@/lib/mercadopago/finalize";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const charge = await prisma.terminalCharge.findUnique({ where: { id } });
  if (!charge) return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });

  // If not yet resolved, pull the order and let finalizeCharge reconcile (idempotent).
  const pending = ["CREATED", "SENT", "PROCESSING"].includes(charge.status);
  if (pending && !charge.mp_order_id.startsWith("pending_")) {
    try {
      const order = await getOrder(charge.mp_order_id);
      const payment = order.transactions?.payments?.[0];
      if (order.status && payment?.id) {
        await finalizeCharge(charge.mp_order_id, {
          status: payment.status ?? order.status,
          paymentId: payment.id,
        });
      }
    } catch {
      // polling is best-effort; webhook remains source of truth
    }
  }

  const fresh = await prisma.terminalCharge.findUnique({ where: { id } });
  return NextResponse.json({
    status: fresh?.status,
    approved: fresh?.status === "APPROVED",
    saleId: fresh?.sale_id,
  });
}
```

- [ ] **Step 4: POST cancel** — `src/app/api/checkout/terminal-charge/[id]/cancel/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelOrder } from "@/lib/mercadopago/orders";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const charge = await prisma.terminalCharge.findUnique({ where: { id } });
  if (!charge) return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 });

  if (!charge.mp_order_id.startsWith("pending_")) {
    await cancelOrder(charge.mp_order_id).catch(() => {});
  }
  await prisma.terminalCharge.update({
    where: { id },
    data: { status: "CANCELED", resolved_at: new Date() },
  });
  if (charge.sale_id) {
    await prisma.sale.update({ where: { id: charge.sale_id }, data: { status: "CANCELLED" } });
  }
  return NextResponse.json({ status: "CANCELED" });
}
```

- [ ] **Step 5: Integration test** — `src/app/api/checkout/terminal-charge/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = {
  paymentTerminal: { findUnique: vi.fn() },
  terminalCharge: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  sale: { create: vi.fn(), delete: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/settings", () => ({ getMaxInstallments: vi.fn(async () => 6) }));
vi.mock("@/lib/mercadopago/orders", () => ({ createTerminalOrder: vi.fn() }));

import { POST } from "./route";
import { createTerminalOrder } from "@/lib/mercadopago/orders";

const createOrderMock = createTerminalOrder as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://x/api/checkout/terminal-charge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const base = {
  terminalId: "t1",
  method: "CREDIT",
  installments: 3,
  totalAmount: 90,
  items: [{ productId: "p1", quantity: 1, unitPrice: 90 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.paymentTerminal.findUnique.mockResolvedValue({ id: "t1", mp_device_id: "DEV", is_active: true });
  prismaMock.terminalCharge.findFirst.mockResolvedValue(null);
  prismaMock.sale.create.mockResolvedValue({ id: "sale_1" });
  prismaMock.terminalCharge.create.mockResolvedValue({ id: "chg_1" });
  prismaMock.terminalCharge.update.mockResolvedValue({ id: "chg_1", status: "SENT" });
  createOrderMock.mockResolvedValue({ id: "ord_1" });
});

describe("POST terminal-charge", () => {
  it("rejects parcela below R$5,00", async () => {
    const res = await POST(req({ ...base, totalAmount: 12, installments: 3 }));
    expect(res.status).toBe(400);
  });
  it("returns 409 when terminal already has an active charge", async () => {
    prismaMock.terminalCharge.findFirst.mockResolvedValue({ id: "old" });
    const res = await POST(req(base));
    expect(res.status).toBe(409);
  });
  it("creates the order and returns chargeId on the happy path", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ chargeId: "chg_1", status: "SENT" });
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ terminalDeviceId: "DEV", installments: 3 })
    );
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npm test -- terminal-charge`
Expected: PASS (3 cases).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/checkout/terminal-charge src/lib/settings.ts
git commit -m "feat: terminal-charge create/status/cancel routes"
```

---

## Phase 6 — Webhook extension

### Task 9: Handle the Orders webhook topic

**Files:**
- Modify: `src/app/api/webhooks/mercadopago/route.ts`
- Test: `src/app/api/webhooks/mercadopago/route.test.ts`

- [ ] **Step 1: Add Orders handling.** Keep the existing signature validation and the existing `type === "payment"` (Checkout Pro) branch. Add a branch for the orders topic (confirm the exact string in the Task 2 contract doc — likely `order`). Update the top imports:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPayment, validateWebhookSignature } from "@/lib/mercadopago";
import { getOrder } from "@/lib/mercadopago/orders";
import { finalizeCharge } from "@/lib/mercadopago/finalize";
```

Then, immediately after the signature check passes and before the `if (body.type !== "payment")` block, insert:

```ts
    // ── Orders topic (Point Smart terminal) ──────────────────────────────
    const topic = body.type ?? body.topic;
    if (topic === "order") {
      const orderId = String(body.data?.id ?? body.id);
      if (!orderId || orderId === "undefined") {
        return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
      }
      const order = await getOrder(orderId);
      const payment = order.transactions?.payments?.[0];
      if (order.status && payment?.id) {
        await finalizeCharge(orderId, {
          status: payment.status ?? order.status,
          paymentId: payment.id,
        });
      }
      return NextResponse.json({ received: true, order: orderId });
    }
```

- [ ] **Step 2: Integration test** — `src/app/api/webhooks/mercadopago/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mercadopago", () => ({
  validateWebhookSignature: vi.fn(() => true),
  getPayment: vi.fn(),
}));
vi.mock("@/lib/mercadopago/orders", () => ({
  getOrder: vi.fn(async () => ({
    id: "ord_1",
    status: "processed",
    transactions: { payments: [{ id: "pay_1", status: "approved" }] },
  })),
}));
vi.mock("@/lib/mercadopago/finalize", () => ({ finalizeCharge: vi.fn() }));

import { POST } from "./route";
import { finalizeCharge } from "@/lib/mercadopago/finalize";

const finalizeMock = finalizeCharge as unknown as ReturnType<typeof vi.fn>;

function orderReq() {
  return new Request("http://x/api/webhooks/mercadopago", {
    method: "POST",
    headers: { "x-signature": "ts=1,v1=abc", "x-request-id": "r1" },
    body: JSON.stringify({ type: "order", data: { id: "ord_1" } }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("webhook orders topic", () => {
  it("finalizes the charge from an order event", async () => {
    const res = await POST(orderReq());
    expect(res.status).toBe(200);
    expect(finalizeMock).toHaveBeenCalledWith("ord_1", {
      status: "approved",
      paymentId: "pay_1",
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- webhooks`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/mercadopago/route.ts
git commit -m "feat: handle Mercado Pago Orders webhook for terminal charges"
```

---

## Phase 7 — PDV checkout flow

### Task 10: Terminal payment in the multi-payment modal

**Files:**
- Modify: `src/components/pos/multi-payment-modal.tsx`
- Create: `src/components/pos/terminal-payment-panel.tsx`

This replaces the old `handleCardPayment` (which used `create-intent` + the `NEXT_PUBLIC_MERCADOPAGO_DEVICE_ID` env var and polled `/api/sales/[id]/status`) with the terminal-charge flow, and unblocks PIX-on-terminal.

- [ ] **Step 1: New sub-component** — `src/components/pos/terminal-payment-panel.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { CreditCard, Landmark, QrCode } from "lucide-react";

interface Terminal { id: string; name: string; is_active: boolean; status: string; }
type Method = "CREDIT" | "DEBIT" | "PIX";

const METHODS: { key: Method; label: string; icon: typeof CreditCard }[] = [
  { key: "CREDIT", label: "Crédito", icon: CreditCard },
  { key: "DEBIT", label: "Débito", icon: Landmark },
  { key: "PIX", label: "PIX", icon: QrCode },
];

export function TerminalPaymentPanel({
  totalAmount,
  onSend,
}: {
  totalAmount: number;
  onSend: (args: { terminalId: string; method: Method; installments: number }) => void;
}) {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalId, setTerminalId] = useState<string>("");
  const [method, setMethod] = useState<Method>("CREDIT");
  const [installments, setInstallments] = useState(1);
  const [maxInstallments, setMaxInstallments] = useState(1);

  useEffect(() => {
    fetch("/api/terminals").then(async (r) => {
      if (r.ok) {
        const list: Terminal[] = (await r.json()).terminals.filter((t: Terminal) => t.is_active);
        setTerminals(list);
        if (list[0]) setTerminalId(list[0].id);
      }
    });
    fetch("/api/settings").then(async (r) => {
      if (r.ok) {
        const data = await r.json();
        const max = parseInt(data?.max_installments ?? "1", 10);
        setMaxInstallments(Number.isFinite(max) && max > 0 ? max : 1);
      }
    });
  }, []);

  const maxByValue = Math.max(1, Math.floor(totalAmount / 5));
  const maxOptions = Math.min(maxInstallments, maxByValue);

  return (
    <div className="space-y-4">
      {terminals.length === 0 ? (
        <p className="text-amber-400 text-sm">
          Nenhuma maquininha vinculada. Configure em Ajustes → Maquininhas.
        </p>
      ) : (
        <>
          {terminals.length > 1 && (
            <select
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl bg-slate-700 text-white px-3"
            >
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => { setMethod(m.key); setInstallments(1); }}
                className={`touch-target min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold ${
                  method === m.key ? "bg-brand-green text-primary-dark" : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                }`}
              >
                <m.icon size={22} />
                {m.label}
              </button>
            ))}
          </div>

          {method === "CREDIT" && maxOptions > 1 && (
            <select
              value={installments}
              onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
              className="w-full min-h-[44px] rounded-xl bg-slate-700 text-white px-3"
            >
              {Array.from({ length: maxOptions }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x de R$ {(totalAmount / n).toFixed(2)}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={!terminalId}
            onClick={() => onSend({ terminalId, method, installments })}
            className="w-full touch-target min-h-[56px] bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 text-primary-dark font-bold text-lg rounded-xl"
          >
            Enviar para maquininha
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the modal.** In `multi-payment-modal.tsx`:
  - Remove `const DEVICE_ID = ...` (line 46).
  - Import the panel: `import { TerminalPaymentPanel } from "./terminal-payment-panel";`.
  - Add state: `const [chargeId, setChargeId] = useState<string | null>(null);`.
  - Replace `handleCardPayment` with `handleTerminalSend`:

```tsx
  const handleTerminalSend = async ({
    terminalId,
    method,
    installments,
  }: { terminalId: string; method: "CREDIT" | "DEBIT" | "PIX"; installments: number }) => {
    setPaymentStatus("PROCESSING");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/checkout/terminal-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terminalId,
          method,
          installments,
          totalAmount,
          items: buildItemsPayload(cartItems),
          customerId: selectedCustomer?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Erro ao enviar para a maquininha.");
        setPaymentStatus("FAILED");
        return;
      }
      setChargeId(data.chargeId);
    } catch {
      setErrorMessage("Erro de conexão com a maquininha.");
      setPaymentStatus("FAILED");
    }
  };
```

  - Change the polling `useEffect` to poll the charge when `chargeId` is set (replace the existing sale-status poll):

```tsx
  useEffect(() => {
    if (paymentStatus === "PROCESSING" && chargeId) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/checkout/terminal-charge/${chargeId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.approved) {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              setPaymentStatus("SUCCESS");
            } else if (data.status === "DECLINED" || data.status === "ERROR") {
              clearInterval(pollIntervalRef.current!);
              pollIntervalRef.current = null;
              setErrorMessage("Pagamento recusado. Tente outro cartão ou método.");
              setPaymentStatus("FAILED");
            }
          }
        } catch { /* ignore */ }
      }, 3000);
      return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
    }
  }, [paymentStatus, chargeId]);
```

  - Reset `chargeId` in the `!isOpen` cleanup effect (add `setChargeId(null);`).
  - In the `IDLE` render, when the single selected payment method is `CARD`, render `<TerminalPaymentPanel totalAmount={totalAmount} onSend={handleTerminalSend} />` instead of routing through `handleConfirmPayment` for card. Keep CASH/VOUCHER paths unchanged. Remove the old "Pagamento misto com Cartão/PIX em breve" restriction for the single-terminal case (mixing a terminal leg with other split methods stays out of scope).
  - In the `PROCESSING` render, add a **Cancelar** button when `chargeId` is set:

```tsx
            {chargeId && (
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/checkout/terminal-charge/${chargeId}/cancel`, { method: "POST" });
                  setPaymentStatus("IDLE");
                  setChargeId(null);
                }}
                className="mt-6 touch-target min-h-[48px] px-6 rounded-xl border-2 border-slate-600 text-slate-300 hover:text-slate-200"
              >
                Cancelar cobrança
              </button>
            )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors in the changed files.

- [ ] **Step 5: Commit**

```bash
git add src/components/pos/multi-payment-modal.tsx src/components/pos/terminal-payment-panel.tsx
git commit -m "feat: terminal payment (credit/debit/pix + installments) in PDV modal"
```

---

## Phase 8 — End-to-end + cleanup

### Task 11: e2e happy path (MP mocked) + retire old scaffold

**Files:**
- Create: `tests/e2e/terminal-payment.spec.ts`
- Create: `src/lib/mercadopago/checkout.ts` (move legacy Checkout Pro helpers here)
- Delete: `src/app/api/checkout/create-intent/route.ts`
- Delete: `src/lib/mercadopago.ts`

- [ ] **Step 1: e2e test.** Add `tests/e2e/terminal-payment.spec.ts` that logs in (reuse `auth.setup.ts`), adds a product to the cart, opens payment, selects a terminal + Crédito + 3x, clicks "Enviar para maquininha", and—using Playwright route interception to stub `POST /api/checkout/terminal-charge` → `{ chargeId: "chg_e2e", status: "SENT" }` and `GET /api/checkout/terminal-charge/chg_e2e` → `{ approved: true, status: "APPROVED" }`—asserts the "Pagamento Aprovado!" screen appears. Follow the structure of the existing `tests/e2e/pdv-customer-flow.spec.ts`.

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e -- terminal-payment`
Expected: PASS.

- [ ] **Step 3: Retire the legacy scaffold.** The webhook still imports `getPayment` and `validateWebhookSignature` from `@/lib/mercadopago` for the Checkout Pro branch. Move those two functions verbatim into `src/lib/mercadopago/checkout.ts`, update the webhook import to `@/lib/mercadopago/checkout`, then delete `src/app/api/checkout/create-intent/route.ts` and `src/lib/mercadopago.ts`. Confirm nothing else imports the old single-file path:

Run: `grep -rn "from \"@/lib/mercadopago\"" src/ || echo "clean"`
Expected: `clean` (all imports now point at `@/lib/mercadopago/<module>`).

- [ ] **Step 4: Full verification**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all unit tests pass, no type errors, build succeeds.

- [ ] **Step 5: Manual device smoke test.** With a real paired device: `/settings/terminals` → Sincronizar → run a real low-value sale through the PDV (Débito), confirm the terminal prompts, approve, and verify the sale shows `APPROVED` with a `SalePayment` row and decremented stock.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: terminal payment e2e; chore: retire legacy create-intent scaffold"
```

---

## Self-review notes (coverage check)

- **Spec §4 (data model)** → Task 1. **§5 (lib modules)** → Tasks 2–4. **§6 (routes)** → Tasks 6, 8, 9. **§7 (idempotency)** → Task 5 + Task 8 Step 3 + Task 9. **§8 (settings UI)** → Task 7. **§9 (PDV flow)** → Task 10. **§10 (config)** → Prerequisites + Task 8 (`max_installments`). **§11 (testing)** → Tasks 0, 3, 4, 5, 8, 9, 11.
- **Spec §10 `max_installments`** is implemented as a key-value setting (Deviation #1), read by `getMaxInstallments()` (Task 8) and the modal panel (Task 10).
- **Open items from spec §12** are pinned by Task 2 (contract verification) before the dependent code runs.
- **Naming consistency:** `finalizeCharge(orderId, { status, paymentId, cardBrand })`, `createTerminalOrder({ terminalDeviceId, amount, method, installments, externalRef })`, `TerminalCharge.mp_order_id`, charge statuses `CREATED|SENT|PROCESSING|APPROVED|DECLINED|CANCELED|ERROR|EXPIRED` — used identically across Tasks 4, 5, 8, 9, 10.
```