# Multi-Acquirer Terminal Provider-Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the Mercado-Pago-only card-terminal integration into a provider-picker — a `TerminalDriver` abstraction (`mercadopago | stone | connecttef`) with per-terminal provider selection, per-tenant encrypted credentials, and an interactive sandbox — without regressing the working MP flow.

**Architecture:** Thin per-provider drivers do only I/O + status normalization; a provider-neutral `TerminalService` owns all stateful orchestration (Sale/TerminalCharge reservation, idempotent finalize, stock) and a registry resolves the right driver (real or sandbox) from a `ProviderConnection`. Mirrors the existing `DeliveryCarrier` pattern. API routes become thin controllers.

**Tech Stack:** Next.js 15 (App Router), Prisma 6 (Postgres/Supabase, `db push` workflow), Zod 4, Vitest 3 (co-located `*.test.ts`, `@/` alias, `vi.hoisted`+`vi.mock` idioms), Playwright, Node `crypto` (AES-256-GCM — no new dependency).

**Source spec:** `docs/superpowers/specs/2026-07-03-multi-acquirer-terminal-provider-picker-design.md`

---

## Conventions used throughout

- Tests are **co-located** next to source as `*.test.ts`. Run a single file with `npx vitest run <path>`; the whole suite with `npm test`.
- Prisma is mocked with `vi.hoisted(() => …)` + `vi.mock("@/lib/prisma", …)` (see `src/lib/mercadopago/finalize.test.ts` for the reference idiom).
- HTTP clients are mocked with `vi.mock("./client", …)` + `vi.importActual` (see `src/lib/mercadopago/orders.test.ts`).
- The DB is synced with `npx prisma db push` (this repo keeps **no** migration history); data backfills are ts-node scripts under `scripts/`, matching `tenant:backfill`.
- Commit after every task. Commit messages use `feat|refactor|test|chore|docs: …` (no attribution — disabled globally).

## File Structure (decomposition)

**New — `src/lib/crypto/`**
- `secretbox.ts` — AES-256-GCM `encryptJson`/`decryptJson`.

**New — `src/lib/terminals/`**
- `types.ts` — `TerminalDriver` contract + shared DTOs (single source of truth for types).
- `status.ts` — provider-agnostic status-word normalization helper.
- `connections.ts` — load/save/decrypt a tenant's `ProviderConnection`.
- `registry.ts` — `resolveDriver(connection)` → real or sandbox driver.
- `finalize.ts` — generalized idempotent finalizer (keyed on `provider`+`external_order_id`).
- `service.ts` — provider-neutral orchestration (`initiateCharge`/`pollCharge`/`cancelCharge`/`handleWebhook`).
- `drivers/mercadopago.ts`, `drivers/stone.ts`, `drivers/connecttef.ts`, `drivers/sandbox.ts`.

**New — routes/scripts**
- `src/app/api/webhooks/terminal/[provider]/route.ts` — generic provider webhook.
- `src/app/api/dev/terminal/simulate-webhook/route.ts` — dev-only sandbox webhook trigger.
- `src/app/api/settings/providers/route.ts` + `src/app/api/settings/providers/[provider]/route.ts` — picker CRUD.
- `scripts/backfill-provider-connections.ts` — `MpConnection` → `ProviderConnection` (encrypted).

**Modified**
- `prisma/schema.prisma`, `.env.example`
- `src/lib/mercadopago/client.ts` (accept per-call token), `finalize.ts` (delegate/retire), `errors.ts` (export `OperatorError` — already exported)
- `src/app/api/checkout/terminal-charge/route.ts` + `[id]/route.ts` + `[id]/cancel/route.ts`
- `src/app/api/webhooks/mercadopago/route.ts`, `src/app/api/terminals/sync/route.ts`
- `src/app/(app)/settings/terminals/page.tsx`
- `src/lib/tenant/scope.ts` (add `ProviderConnection`)

---

## Phase 0 — Credential encryption

### Task 0.1: `secretbox` AES-256-GCM util

**Files:**
- Create: `src/lib/crypto/secretbox.ts`
- Test: `src/lib/crypto/secretbox.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/crypto/secretbox.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // deterministic 32-byte key for tests
  process.env.CREDENTIALS_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
});

import { encryptJson, decryptJson } from "./secretbox";

describe("secretbox", () => {
  it("round-trips an object", () => {
    const blob = encryptJson({ accessToken: "tok_123", n: 3 });
    expect(blob).not.toContain("tok_123");
    expect(decryptJson<{ accessToken: string; n: number }>(blob)).toEqual({ accessToken: "tok_123", n: 3 });
  });

  it("produces a fresh IV each call (ciphertext differs)", () => {
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
  });

  it("throws on a tampered blob", () => {
    const blob = encryptJson({ a: 1 });
    const [iv, tag, data] = blob.split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptJson(`${iv}.${tag}.${flipped.toString("base64")}`)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/crypto/secretbox.test.ts`
Expected: FAIL — cannot resolve `./secretbox`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/crypto/secretbox.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENC_KEY;
  if (!raw) throw new Error("CREDENTIALS_ENC_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_ENC_KEY must decode to 32 bytes");
  return key;
}

/** Encrypts any JSON-serializable value → "base64(iv).base64(tag).base64(ciphertext)". */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const pt = Buffer.from(JSON.stringify(value), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decryptJson<T = unknown>(blob: string): T {
  const [ivB64, tagB64, dataB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed ciphertext");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/crypto/secretbox.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Document the env var**

Append to `.env.example`:

```bash
# 32-byte key, base64-encoded. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CREDENTIALS_ENC_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto/secretbox.ts src/lib/crypto/secretbox.test.ts .env.example
git commit -m "feat: AES-256-GCM secretbox for provider credentials"
```

---

## Phase 1 — Driver contract & shared types

### Task 1.1: Status-normalization helper

**Files:**
- Create: `src/lib/terminals/status.ts`
- Test: `src/lib/terminals/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/terminals/status.test.ts
import { describe, it, expect } from "vitest";
import { normalizeChargeStatus } from "./status";

describe("normalizeChargeStatus", () => {
  it("maps approval words to APPROVED", () => {
    for (const w of ["approved", "processed", "paid", "PAID"]) {
      expect(normalizeChargeStatus(w)).toBe("APPROVED");
    }
  });
  it("maps in-flight words to PROCESSING", () => {
    for (const w of ["pending", "processing", "in_process"]) {
      expect(normalizeChargeStatus(w)).toBe("PROCESSING");
    }
  });
  it("maps cancel words to CANCELED", () => {
    expect(normalizeChargeStatus("cancelled")).toBe("CANCELED");
    expect(normalizeChargeStatus("canceled")).toBe("CANCELED");
  });
  it("defaults unknown/failure to DECLINED", () => {
    expect(normalizeChargeStatus("rejected")).toBe("DECLINED");
    expect(normalizeChargeStatus("whatever")).toBe("DECLINED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/status.test.ts`
Expected: FAIL — cannot resolve `./status`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/terminals/status.ts
import type { TerminalChargeStatus } from "@prisma/client";

const APPROVED = new Set(["approved", "processed", "paid", "authorized"]);
const PROCESSING = new Set(["pending", "processing", "in_process", "sent", "created"]);
const CANCELED = new Set(["canceled", "cancelled", "refunded", "voided"]);

/** Normalizes a provider's raw status string into our TerminalChargeStatus enum. */
export function normalizeChargeStatus(raw: string): TerminalChargeStatus {
  const s = raw.trim().toLowerCase();
  if (APPROVED.has(s)) return "APPROVED";
  if (CANCELED.has(s)) return "CANCELED";
  if (PROCESSING.has(s)) return "PROCESSING";
  return "DECLINED";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/status.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminals/status.ts src/lib/terminals/status.test.ts
git commit -m "feat: provider-agnostic charge-status normalization"
```

### Task 1.2: Driver contract types

**Files:**
- Create: `src/lib/terminals/types.ts`

> Types-only module — no test (verified by `tsc` when consumers compile). This is the single source of truth; later tasks import from here.

- [ ] **Step 1: Write the contract**

```ts
// src/lib/terminals/types.ts
import type { TerminalChargeStatus, TerminalChargeMethod, TerminalProviderName } from "@prisma/client";
import type { OperatorError } from "@/lib/mercadopago/errors";
export type { OperatorError } from "@/lib/mercadopago/errors";
export type { TerminalProviderName } from "@prisma/client";

export type DriverResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: OperatorError };

/** Decrypted, provider-specific credential blob (shape depends on provider). */
export type ProviderCredentials = Record<string, unknown>;

export interface CreateChargeInput {
  deviceExternalId: string;
  amount: number; // reais
  method: TerminalChargeMethod;
  installments: number;
  externalRef: string; // our TerminalCharge.id — idempotency key
}

export interface ProviderCharge {
  externalOrderId: string;
  externalPaymentId?: string;
  status: TerminalChargeStatus; // already normalized
  cardBrand?: string;
  raw?: unknown;
}

export interface WebhookResolution {
  providerName: TerminalProviderName;
  externalOrderId: string;
  status: TerminalChargeStatus;
  externalPaymentId?: string;
  cardBrand?: string;
  tenantHint?: { key: string; value: string };
}

export interface ProviderDevice {
  id: string;
  operatingMode?: "PDV" | "STANDALONE";
}

export interface DriverCapabilities {
  deviceSync: boolean;
  operatingModes: boolean;
  cancel: boolean;
  installments: boolean;
  methods: TerminalChargeMethod[];
}

export interface TerminalDriver {
  readonly name: TerminalProviderName;
  readonly capabilities: DriverCapabilities;

  createCharge(creds: ProviderCredentials, input: CreateChargeInput): Promise<DriverResult<ProviderCharge>>;
  getChargeStatus(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<ProviderCharge>>;
  cancelCharge(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<void>>;

  verifyWebhook(headers: Record<string, string>, rawBody: string, creds?: ProviderCredentials): boolean;
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<DriverResult<WebhookResolution>>;

  listDevices?(creds: ProviderCredentials): Promise<DriverResult<ProviderDevice[]>>;
  setOperatingMode?(creds: ProviderCredentials, deviceId: string, mode: "PDV" | "STANDALONE"): Promise<DriverResult<void>>;
}
```

> Note: `TerminalProviderName` is a Prisma enum introduced in Phase 2. This file will not typecheck until Phase 2 runs `prisma generate`. That is expected; do not run a full `tsc` until Phase 2 Step 6.

- [ ] **Step 2: Commit**

```bash
git add src/lib/terminals/types.ts
git commit -m "feat: TerminalDriver contract and shared terminal DTOs"
```

---

## Phase 2 — Data model (additive)

### Task 2.1: Prisma schema — enums, columns, `ProviderConnection`

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/tenant/scope.ts`

- [ ] **Step 1: Add enums** (near the other terminal enums)

```prisma
enum TerminalProviderName {
  mercadopago
  stone
  connecttef
}

enum ProviderMode {
  sandbox
  live
}

enum ConnectionStatus {
  disconnected
  sandbox
  live
  error
}
```

- [ ] **Step 2: Extend `PaymentTerminal`** — add `provider`, add `device_external_id`, keep `mp_device_id` for now (dropped in Phase 11), relax the old unique, add the new one:

```prisma
model PaymentTerminal {
  id                 String                @id @default(cuid())
  tenant_id          String?
  name               String
  provider           TerminalProviderName  @default(mercadopago)
  mp_device_id       String                // DEPRECATED — dropped in Phase 11
  device_external_id String?               // backfilled from mp_device_id in Task 2.2
  operating_mode     TerminalOperatingMode @default(PDV)
  status             TerminalStatus        @default(UNKNOWN)
  location_label     String?
  is_active          Boolean               @default(true)
  last_seen_at       DateTime?
  created_at         DateTime              @default(now())

  charges TerminalCharge[]

  @@unique([tenant_id, provider, device_external_id])
  @@index([tenant_id])
  @@index([is_active])
  @@map("payment_terminals")
}
```

- [ ] **Step 3: Extend `TerminalCharge`** — add `provider`, `external_order_id`, `external_payment_id`; keep `mp_*` for now:

```prisma
model TerminalCharge {
  id                  String               @id @default(cuid())
  tenant_id           String?
  sale_id             String?
  terminal_id         String
  provider            TerminalProviderName @default(mercadopago)
  mp_order_id         String               // DEPRECATED — dropped in Phase 11
  mp_payment_id       String?              // DEPRECATED — dropped in Phase 11
  external_order_id   String?              // backfilled in Task 2.2
  external_payment_id String?
  amount              Decimal              @db.Decimal(10, 2)
  method              TerminalChargeMethod
  installments        Int                  @default(1)
  status              TerminalChargeStatus @default(CREATED)
  error_code          String?
  created_at          DateTime             @default(now())
  resolved_at         DateTime?

  terminal PaymentTerminal @relation(fields: [terminal_id], references: [id])
  sale     Sale?           @relation(fields: [sale_id], references: [id])

  @@unique([tenant_id, provider, external_order_id])
  @@index([tenant_id])
  @@index([terminal_id])
  @@index([sale_id])
  @@index([status])
  @@map("terminal_charges")
}
```

> The old `@@unique([tenant_id, mp_order_id])` is removed. Because `external_order_id` is nullable during backfill, the new composite unique tolerates nulls (Postgres treats NULLs as distinct) until Phase 11 makes it NOT NULL.

- [ ] **Step 4: Add `ProviderConnection` and back-relation on `Tenant`**

```prisma
model ProviderConnection {
  id                  String               @id @default(cuid())
  tenant_id           String
  provider            TerminalProviderName
  credentials         String               // AES-256-GCM encrypted JSON (secretbox)
  mode                ProviderMode         @default(sandbox)
  status              ConnectionStatus     @default(disconnected)
  external_account_id String?              // e.g. mp user_id / stone merchant id
  created_at          DateTime             @default(now())
  updated_at          DateTime             @updatedAt

  tenant Tenant @relation(fields: [tenant_id], references: [id])

  @@unique([tenant_id, provider])
  @@index([provider, external_account_id])
  @@map("provider_connections")
}
```

In `model Tenant`, add:

```prisma
  provider_connections ProviderConnection[]
```

- [ ] **Step 5: Sync + generate**

Run: `npx prisma db push && npx prisma generate`
Expected: schema applied; `TerminalProviderName`, `ProviderMode`, `ConnectionStatus` now exported from `@prisma/client`. `provider_connections` table created.

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS — `src/lib/terminals/types.ts` (Phase 1) now resolves `TerminalProviderName`.

- [ ] **Step 7: Register `ProviderConnection` as tenant-owned**

In `src/lib/tenant/scope.ts`, add `"ProviderConnection"` to the `TENANT_MODELS` set.

- [ ] **Step 8: Run scope tests + commit**

Run: `npx vitest run src/lib/tenant/scope.test.ts`
Expected: PASS.

```bash
git add prisma/schema.prisma src/lib/tenant/scope.ts
git commit -m "feat: terminal provider columns + ProviderConnection model"
```

### Task 2.2: Backfill script — provider + external ids + encrypted MP connection

**Files:**
- Create: `scripts/backfill-provider-connections.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write the backfill script**

```ts
// scripts/backfill-provider-connections.ts
// Backfills existing MP data onto the generalized columns and migrates
// MpConnection tokens into an encrypted ProviderConnection. Idempotent.
import { basePrisma } from "@/lib/prisma";
import { encryptJson } from "@/lib/crypto/secretbox";

async function main() {
  // 1. terminals: device_external_id <- mp_device_id (only where empty)
  const terminals = await basePrisma.paymentTerminal.findMany({ where: { device_external_id: null } });
  for (const t of terminals) {
    await basePrisma.paymentTerminal.update({
      where: { id: t.id },
      data: { device_external_id: t.mp_device_id, provider: "mercadopago" },
    });
  }
  console.log(`terminals backfilled: ${terminals.length}`);

  // 2. charges: external_order_id <- mp_order_id, external_payment_id <- mp_payment_id
  const charges = await basePrisma.terminalCharge.findMany({ where: { external_order_id: null } });
  for (const c of charges) {
    await basePrisma.terminalCharge.update({
      where: { id: c.id },
      data: {
        provider: "mercadopago",
        external_order_id: c.mp_order_id,
        external_payment_id: c.mp_payment_id,
      },
    });
  }
  console.log(`charges backfilled: ${charges.length}`);

  // 3. MpConnection -> encrypted ProviderConnection (upsert, idempotent)
  const conns = await basePrisma.mpConnection.findMany();
  for (const m of conns) {
    const credentials = encryptJson({
      accessToken: m.access_token,
      refreshToken: m.refresh_token,
      mpUserId: m.mp_user_id,
      publicKey: m.public_key ?? undefined,
    });
    await basePrisma.providerConnection.upsert({
      where: { tenant_id_provider: { tenant_id: m.tenant_id, provider: "mercadopago" } },
      create: {
        tenant_id: m.tenant_id,
        provider: "mercadopago",
        credentials,
        mode: m.live_mode ? "live" : "sandbox",
        status: m.live_mode ? "live" : "sandbox",
        external_account_id: m.mp_user_id,
      },
      update: { credentials, external_account_id: m.mp_user_id },
    });
  }
  console.log(`MP connections migrated: ${conns.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Register the script** in `package.json` `scripts`:

```json
"db:providers:backfill": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' scripts/backfill-provider-connections.ts",
```

- [ ] **Step 3: Run the backfill** (requires `CREDENTIALS_ENC_KEY` set in `.env`)

Run: `npm run db:providers:backfill`
Expected: prints the three backfilled counts, exits 0. Re-running prints `0 / 0` for terminals/charges (idempotent) and re-upserts connections.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-provider-connections.ts package.json
git commit -m "feat: backfill provider columns + encrypted ProviderConnection"
```

---

## Phase 3 — ProviderConnection access layer

### Task 3.1: Load/decrypt a tenant's connection

**Files:**
- Create: `src/lib/terminals/connections.ts`
- Test: `src/lib/terminals/connections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/terminals/connections.test.ts
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { providerConnection: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeAll(() => { process.env.CREDENTIALS_ENC_KEY = Buffer.alloc(32, 7).toString("base64"); });
beforeEach(() => vi.clearAllMocks());

import { encryptJson } from "@/lib/crypto/secretbox";
import { loadConnection } from "./connections";

describe("loadConnection", () => {
  it("returns the connection with decrypted credentials", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue({
      id: "pc_1", provider: "mercadopago", mode: "live", status: "live",
      external_account_id: "u_9", credentials: encryptJson({ accessToken: "tok" }),
    });
    const res = await loadConnection("mercadopago");
    expect(res?.credentials).toEqual({ accessToken: "tok" });
    expect(res?.mode).toBe("live");
  });

  it("returns null when no connection exists", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(null);
    expect(await loadConnection("stone")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/connections.test.ts`
Expected: FAIL — cannot resolve `./connections`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/terminals/connections.ts
import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto/secretbox";
import type { ProviderCredentials, TerminalProviderName } from "./types";
import type { ProviderMode, ConnectionStatus } from "@prisma/client";

export interface LoadedConnection {
  id: string;
  provider: TerminalProviderName;
  mode: ProviderMode;
  status: ConnectionStatus;
  externalAccountId: string | null;
  credentials: ProviderCredentials;
}

/**
 * Loads the current tenant's connection for a provider. The tenant-scoped `prisma`
 * client injects `tenant_id`, so `findFirst({ where: { provider } })` returns the
 * single row guaranteed unique by `@@unique([tenant_id, provider])`.
 */
export async function loadConnection(provider: TerminalProviderName): Promise<LoadedConnection | null> {
  const row = await prisma.providerConnection.findFirst({ where: { provider } });
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    externalAccountId: row.external_account_id,
    credentials: decryptJson<ProviderCredentials>(row.credentials),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/connections.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminals/connections.ts src/lib/terminals/connections.test.ts
git commit -m "feat: load + decrypt per-tenant ProviderConnection"
```

---

## Phase 4 — Mercado Pago driver

### Task 4.1: Make `mpFetch` accept a per-call token

**Files:**
- Modify: `src/lib/mercadopago/client.ts`
- Create: `src/lib/mercadopago/client.test.ts`
- Modify: `src/lib/mercadopago/orders.ts`, `src/lib/mercadopago/devices.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/mercadopago/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mpFetch } from "./client";

describe("mpFetch token", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("uses an explicit accessToken over the env token", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await mpFetch("/v1/orders/x", { accessToken: "tok_explicit" });
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok_explicit");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/mercadopago/client.test.ts`
Expected: FAIL — `accessToken` not honored.

- [ ] **Step 3: Implement — add optional `accessToken` to `mpFetch` init**

In `src/lib/mercadopago/client.ts`, change `mpFetch` so the init accepts `accessToken?: string`, falling back to `getAccessToken()`:

```ts
export async function mpFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string; accessToken?: string } = {},
): Promise<unknown> {
  const { idempotencyKey, accessToken, headers, ...rest } = init;
  const token = accessToken ?? getAccessToken();
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new MpApiError(res.status, await res.text());
  return res.json();
}
```

- [ ] **Step 4: Thread `accessToken` through `orders.ts`/`devices.ts`**

Add an optional `accessToken` parameter to `createTerminalOrder`, `getOrder`, `cancelOrder`, `listDevices`, `setOperatingMode`, forwarding it into `mpFetch`. Example for `getOrder`:

```ts
export async function getOrder(orderId: string, accessToken?: string): Promise<MpOrder> {
  return (await mpFetch(`/v1/orders/${orderId}`, { accessToken })) as MpOrder;
}
```

For `createTerminalOrder`, merge `accessToken` into the existing `mpFetch` init (keep `idempotencyKey: externalRef`). Apply the analogous one-line change to `cancelOrder`, `listDevices`, `setOperatingMode`.

- [ ] **Step 5: Run existing MP tests to confirm no regression**

Run: `npx vitest run src/lib/mercadopago/`
Expected: PASS (existing orders/errors/amount/finalize tests unaffected; new client test passes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/mercadopago/client.ts src/lib/mercadopago/client.test.ts src/lib/mercadopago/orders.ts src/lib/mercadopago/devices.ts
git commit -m "refactor: allow per-call MP access token (per-tenant)"
```

### Task 4.2: MercadoPago driver

**Files:**
- Create: `src/lib/terminals/drivers/mercadopago.ts`
- Test: `src/lib/terminals/drivers/mercadopago.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/terminals/drivers/mercadopago.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mercadopago/orders", () => ({
  createTerminalOrder: vi.fn(),
  getOrder: vi.fn(),
  cancelOrder: vi.fn(),
}));

import { createTerminalOrder, getOrder } from "@/lib/mercadopago/orders";
import { mercadoPagoDriver } from "./mercadopago";

const creds = { accessToken: "tok", mpUserId: "u_1" };
beforeEach(() => vi.clearAllMocks());

describe("mercadoPagoDriver", () => {
  it("creates a charge and returns a normalized ProviderCharge", async () => {
    (createTerminalOrder as any).mockResolvedValue({ id: "ord_1", status: "created" });
    const res = await mercadoPagoDriver.createCharge(creds, {
      deviceExternalId: "DEV1", amount: 10, method: "CREDIT", installments: 1, externalRef: "chg_1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.externalOrderId).toBe("ord_1");
      expect(res.data.status).toBe("PROCESSING");
    }
    expect(createTerminalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ terminalDeviceId: "DEV1", externalRef: "chg_1" }),
      "tok",
    );
  });

  it("normalizes an approved order status on getChargeStatus", async () => {
    (getOrder as any).mockResolvedValue({
      id: "ord_1", status: "processed",
      transactions: { payments: [{ id: "pay_1", status: "approved" }] },
    });
    const res = await mercadoPagoDriver.getChargeStatus(creds, "ord_1");
    expect(res.ok && res.data.status).toBe("APPROVED");
    expect(res.ok && res.data.externalPaymentId).toBe("pay_1");
  });

  it("maps MP API errors to an OperatorError", async () => {
    (createTerminalOrder as any).mockRejectedValue(Object.assign(new Error("x"), { status: 409 }));
    const res = await mercadoPagoDriver.createCharge(creds, {
      deviceExternalId: "DEV1", amount: 10, method: "CREDIT", installments: 1, externalRef: "chg_1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("DEVICE_BUSY");
  });

  it("declares MP capabilities", () => {
    expect(mercadoPagoDriver.capabilities).toMatchObject({
      deviceSync: true, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"],
    });
  });
});
```

> This assumes `mapMpErrorToOperatorMessage` maps a `{status:409}` error to `DEVICE_BUSY` (confirmed in `src/lib/mercadopago/errors.ts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/drivers/mercadopago.test.ts`
Expected: FAIL — cannot resolve `./mercadopago`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/terminals/drivers/mercadopago.ts
import { createTerminalOrder, getOrder, cancelOrder } from "@/lib/mercadopago/orders";
import { listDevices, setOperatingMode } from "@/lib/mercadopago/devices";
import { mapMpErrorToOperatorMessage } from "@/lib/mercadopago/errors";
import { validateWebhookSignature } from "@/lib/mercadopago/checkout";
import { normalizeChargeStatus } from "../status";
import type {
  TerminalDriver, DriverResult, ProviderCharge, ProviderCredentials,
  CreateChargeInput, WebhookResolution, ProviderDevice,
} from "../types";

function token(creds: ProviderCredentials): string {
  return String(creds.accessToken ?? "");
}

function extractPayment(order: any): { id?: string; status?: string } {
  return order?.transactions?.payments?.[0] ?? {};
}

export const mercadoPagoDriver: TerminalDriver = {
  name: "mercadopago",
  capabilities: {
    deviceSync: true, operatingModes: true, cancel: true, installments: true,
    methods: ["CREDIT", "DEBIT", "PIX"],
  },

  async createCharge(creds, input: CreateChargeInput): Promise<DriverResult<ProviderCharge>> {
    try {
      const order: any = await createTerminalOrder(
        {
          terminalDeviceId: input.deviceExternalId,
          amount: input.amount,
          method: input.method,
          installments: input.installments,
          externalRef: input.externalRef,
        },
        token(creds),
      );
      return { ok: true, data: { externalOrderId: order.id, status: normalizeChargeStatus(order.status ?? "created"), raw: order } };
    } catch (err) {
      return { ok: false, error: mapMpErrorToOperatorMessage(err) };
    }
  },

  async getChargeStatus(creds, externalOrderId): Promise<DriverResult<ProviderCharge>> {
    try {
      const order: any = await getOrder(externalOrderId, token(creds));
      const p = extractPayment(order);
      return {
        ok: true,
        data: {
          externalOrderId,
          externalPaymentId: p.id,
          status: normalizeChargeStatus(p.status ?? order.status ?? "processing"),
          raw: order,
        },
      };
    } catch (err) {
      return { ok: false, error: mapMpErrorToOperatorMessage(err) };
    }
  },

  async cancelCharge(creds, externalOrderId): Promise<DriverResult<void>> {
    try {
      await cancelOrder(externalOrderId, token(creds));
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: mapMpErrorToOperatorMessage(err) };
    }
  },

  verifyWebhook(headers, rawBody) {
    const dataId = (() => { try { return JSON.parse(rawBody)?.data?.id ?? ""; } catch { return ""; } })();
    return validateWebhookSignature(headers["x-signature"] ?? "", headers["x-request-id"] ?? "", dataId);
  },

  async parseWebhook(_headers, body: any): Promise<DriverResult<WebhookResolution>> {
    const orderId = body?.data?.id ?? body?.id;
    if (!orderId) return { ok: false, error: { code: "GENERIC", message: "webhook sem order id" } };
    // Status is re-resolved by the service via getChargeStatus using tenant creds;
    // here we only surface identifiers + tenant hint.
    return {
      ok: true,
      data: {
        providerName: "mercadopago",
        externalOrderId: String(orderId),
        status: "PROCESSING",
        tenantHint: body?.user_id ? { key: "external_account_id", value: String(body.user_id) } : undefined,
      },
    };
  },

  async listDevices(creds): Promise<DriverResult<ProviderDevice[]>> {
    try {
      const devices: any[] = await listDevices(token(creds));
      return { ok: true, data: devices.map((d) => ({ id: d.id, operatingMode: d.operating_mode })) };
    } catch (err) {
      return { ok: false, error: mapMpErrorToOperatorMessage(err) };
    }
  },

  async setOperatingMode(creds, deviceId, mode): Promise<DriverResult<void>> {
    try {
      await setOperatingMode(deviceId, mode, token(creds));
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: mapMpErrorToOperatorMessage(err) };
    }
  },
};
```

> `listDevices`/`setOperatingMode` gained an `accessToken` param in Task 4.1 Step 4; `validateWebhookSignature` needs no token.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/drivers/mercadopago.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminals/drivers/mercadopago.ts src/lib/terminals/drivers/mercadopago.test.ts
git commit -m "feat: MercadoPago terminal driver"
```

---

## Phase 5 — Registry + sandbox driver

### Task 5.1: Sandbox driver

**Files:**
- Create: `src/lib/terminals/drivers/sandbox.ts`
- Test: `src/lib/terminals/drivers/sandbox.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/terminals/drivers/sandbox.test.ts
import { describe, it, expect } from "vitest";
import { sandboxDriver } from "./sandbox";

describe("sandboxDriver", () => {
  it("createCharge returns a fake order in PROCESSING", async () => {
    const d = sandboxDriver("stone");
    const res = await d.createCharge({}, { deviceExternalId: "X", amount: 1, method: "DEBIT", installments: 1, externalRef: "chg_1" });
    expect(res.ok && res.data.status).toBe("PROCESSING");
    expect(res.ok && res.data.externalOrderId).toContain("sbx_");
  });

  it("getChargeStatus is PROCESSING before the delay and APPROVED after", async () => {
    const d = sandboxDriver("stone");
    const fresh = `sbx_chg_1_${Date.now()}`;
    const early = await d.getChargeStatus({}, fresh);
    expect(early.ok && early.data.status).toBe("PROCESSING");
    const old = `sbx_chg_1_${Date.now() - 10_000}`;
    const late = await d.getChargeStatus({}, old);
    expect(late.ok && late.data.status).toBe("APPROVED");
  });

  it("name matches the requested provider", () => {
    expect(sandboxDriver("connecttef").name).toBe("connecttef");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/drivers/sandbox.test.ts`
Expected: FAIL — cannot resolve `./sandbox`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/terminals/drivers/sandbox.ts
import type { TerminalDriver, DriverResult, ProviderCharge, WebhookResolution } from "../types";
import type { TerminalProviderName } from "@prisma/client";

const APPROVE_AFTER_MS = 4_000;

/**
 * A realistic mock driver: createCharge encodes creation time into the order id,
 * so the existing poll path finalizes it after APPROVE_AFTER_MS with no timers.
 */
export function sandboxDriver(name: TerminalProviderName): TerminalDriver {
  return {
    name,
    capabilities: { deviceSync: false, operatingModes: false, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"] },

    async createCharge(_creds, input): Promise<DriverResult<ProviderCharge>> {
      const externalOrderId = `sbx_${input.externalRef}_${Date.now()}`;
      return { ok: true, data: { externalOrderId, status: "PROCESSING" } };
    },

    async getChargeStatus(_creds, externalOrderId): Promise<DriverResult<ProviderCharge>> {
      const createdAt = Number(externalOrderId.split("_").pop());
      const approved = Number.isFinite(createdAt) && Date.now() - createdAt >= APPROVE_AFTER_MS;
      return {
        ok: true,
        data: {
          externalOrderId,
          externalPaymentId: approved ? `${externalOrderId}_pay` : undefined,
          status: approved ? "APPROVED" : "PROCESSING",
          cardBrand: approved ? "sandbox" : undefined,
        },
      };
    },

    async cancelCharge() { return { ok: true, data: undefined }; },

    verifyWebhook() { return true; },

    async parseWebhook(_headers, body: any): Promise<DriverResult<WebhookResolution>> {
      const externalOrderId = String(body?.externalOrderId ?? "");
      return { ok: true, data: { providerName: name, externalOrderId, status: "APPROVED", externalPaymentId: `${externalOrderId}_pay`, cardBrand: "sandbox" } };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/drivers/sandbox.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminals/drivers/sandbox.ts src/lib/terminals/drivers/sandbox.test.ts
git commit -m "feat: interactive sandbox terminal driver"
```

### Task 5.2: Registry (with temporary Stone/ConnectTEF stubs)

**Files:**
- Create: `src/lib/terminals/registry.ts`
- Test: `src/lib/terminals/registry.test.ts`
- Create (temporary stubs): `src/lib/terminals/drivers/stone.ts`, `src/lib/terminals/drivers/connecttef.ts`

- [ ] **Step 1: Create the temporary stubs** (replaced by real drivers in Phases 8–9)

```ts
// src/lib/terminals/drivers/stone.ts (temporary stub — completed in Phase 8)
import { sandboxDriver } from "./sandbox";
export const stoneDriver = sandboxDriver("stone");
```

```ts
// src/lib/terminals/drivers/connecttef.ts (temporary stub — completed in Phase 9)
import { sandboxDriver } from "./sandbox";
export const connectTefDriver = sandboxDriver("connecttef");
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/terminals/registry.test.ts
import { describe, it, expect } from "vitest";
import { resolveDriver } from "./registry";

describe("resolveDriver", () => {
  it("returns the real MP driver in live mode", () => {
    const d = resolveDriver({ provider: "mercadopago", mode: "live" } as any);
    expect(d.name).toBe("mercadopago");
    expect(d.capabilities.deviceSync).toBe(true);
  });
  it("returns a sandbox driver in sandbox mode", () => {
    const d = resolveDriver({ provider: "stone", mode: "sandbox" } as any);
    expect(d.name).toBe("stone");
    expect(d.capabilities.deviceSync).toBe(false); // sandbox capability profile
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/registry.test.ts`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/terminals/registry.ts
import type { TerminalDriver, TerminalProviderName } from "./types";
import { mercadoPagoDriver } from "./drivers/mercadopago";
import { stoneDriver } from "./drivers/stone";
import { connectTefDriver } from "./drivers/connecttef";
import { sandboxDriver } from "./drivers/sandbox";

const REAL: Record<TerminalProviderName, TerminalDriver> = {
  mercadopago: mercadoPagoDriver,
  stone: stoneDriver,
  connecttef: connectTefDriver,
};

export function resolveDriver(conn: { provider: TerminalProviderName; mode: "sandbox" | "live" }): TerminalDriver {
  return conn.mode === "live" ? REAL[conn.provider] : sandboxDriver(conn.provider);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/terminals/registry.ts src/lib/terminals/registry.test.ts src/lib/terminals/drivers/stone.ts src/lib/terminals/drivers/connecttef.ts
git commit -m "feat: terminal driver registry (real vs sandbox)"
```

---

## Phase 6 — Provider-neutral service + generalized finalize

### Task 6.1: Generalized finalizer

**Files:**
- Create: `src/lib/terminals/finalize.ts`
- Test: `src/lib/terminals/finalize.test.ts`

> Mirrors `src/lib/mercadopago/finalize.ts` but looks up by `(provider, external_order_id)` and takes an already-normalized `TerminalChargeStatus`.

- [ ] **Step 1: Write the failing test** (adapted from the MP finalize test idiom)

```ts
// src/lib/terminals/finalize.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { tx, basePrismaMock } = vi.hoisted(() => {
  const tx = {
    terminalCharge: { update: vi.fn() },
    sale: { update: vi.fn() },
    salePayment: { create: vi.fn() },
    productVariant: { update: vi.fn() },
    product: { update: vi.fn() },
  };
  const basePrismaMock = {
    terminalCharge: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, basePrismaMock };
});
vi.mock("@/lib/prisma", () => ({ basePrisma: basePrismaMock }));

import { finalizeTerminalCharge } from "./finalize";

beforeEach(() => vi.clearAllMocks());
const charge = (o = {}) => ({
  id: "chg_1", provider: "stone", external_order_id: "ord_1", sale_id: "sale_1",
  amount: 100, method: "CREDIT", installments: 3, status: "SENT",
  sale: { id: "sale_1", status: "PENDING", items: [{ product_id: "p1", variant_id: "v1", quantity: 2 }] },
  ...o,
});

describe("finalizeTerminalCharge", () => {
  it("approves, records payment, decrements stock on APPROVED", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge());
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "ord_1", status: "APPROVED", externalPaymentId: "pay_9", cardBrand: "visa" });
    expect(tx.sale.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "APPROVED" } }));
    expect(tx.salePayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ terminal_charge_id: "chg_1", card_brand: "visa" }) }));
    expect(tx.productVariant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "v1" }, data: { stock_quantity: { decrement: 2 } } }));
  });

  it("is idempotent when already APPROVED", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge({ status: "APPROVED" }));
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "ord_1", status: "APPROVED", externalPaymentId: "p" });
    expect(basePrismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("marks DECLINED without touching stock", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(charge());
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "ord_1", status: "DECLINED", externalPaymentId: "p" });
    expect(basePrismaMock.terminalCharge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DECLINED" }) }));
    expect(tx.sale.update).not.toHaveBeenCalled();
  });

  it("no-ops on unknown order", async () => {
    basePrismaMock.terminalCharge.findFirst.mockResolvedValue(null);
    await finalizeTerminalCharge({ provider: "stone", externalOrderId: "nope", status: "APPROVED", externalPaymentId: "p" });
    expect(basePrismaMock.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/finalize.test.ts`
Expected: FAIL — cannot resolve `./finalize`.

- [ ] **Step 3: Write minimal implementation** (port the transaction body from `src/lib/mercadopago/finalize.ts`)

```ts
// src/lib/terminals/finalize.ts
import { basePrisma } from "@/lib/prisma";
import type { TerminalChargeStatus, TerminalProviderName } from "@prisma/client";

const TERMINAL_STATES = new Set(["APPROVED", "DECLINED", "CANCELED", "ERROR", "EXPIRED"]);

export interface FinalizeInput {
  provider: TerminalProviderName;
  externalOrderId: string;
  status: TerminalChargeStatus; // normalized by the driver
  externalPaymentId?: string;
  cardBrand?: string;
}

/** Idempotent reconciliation: keyed on (provider, external_order_id). */
export async function finalizeTerminalCharge(input: FinalizeInput): Promise<void> {
  const charge = await basePrisma.terminalCharge.findFirst({
    where: { provider: input.provider, external_order_id: input.externalOrderId },
    include: { sale: { include: { items: true } } },
  });
  if (!charge || TERMINAL_STATES.has(charge.status)) return;

  if (input.status !== "APPROVED") {
    await basePrisma.terminalCharge.update({
      where: { id: charge.id },
      data: { status: input.status, error_code: input.status, resolved_at: new Date(), external_payment_id: input.externalPaymentId },
    });
    return;
  }

  await basePrisma.$transaction(async (tx) => {
    await tx.terminalCharge.update({
      where: { id: charge.id },
      data: { status: "APPROVED", external_payment_id: input.externalPaymentId, resolved_at: new Date() },
    });
    if (charge.sale_id) {
      await tx.sale.update({ where: { id: charge.sale_id }, data: { status: "APPROVED" } });
      await tx.salePayment.create({
        data: {
          sale_id: charge.sale_id,
          payment_method: charge.method === "PIX" ? "PIX" : "CARD",
          amount: charge.amount,
          installments: charge.installments,
          card_brand: input.cardBrand,
          mp_payment_id: input.externalPaymentId,
          terminal_charge_id: charge.id,
        },
      });
      for (const item of charge.sale?.items ?? []) {
        if (item.variant_id) {
          await tx.productVariant.update({ where: { id: item.variant_id }, data: { stock_quantity: { decrement: item.quantity } } });
        } else {
          await tx.product.update({ where: { id: item.product_id }, data: { stock_quantity: { decrement: item.quantity } } });
        }
      }
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/finalize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminals/finalize.ts src/lib/terminals/finalize.test.ts
git commit -m "feat: provider-neutral idempotent finalizer"
```

### Task 6.2: TerminalService (initiate/poll/cancel)

**Files:**
- Create: `src/lib/terminals/service.ts`
- Test: `src/lib/terminals/service.test.ts`

- [ ] **Step 1: Write the failing test** (service against the sandbox driver + mocked prisma)

```ts
// src/lib/terminals/service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    paymentTerminal: { findFirst: vi.fn() },
    terminalCharge: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    sale: { create: vi.fn(), delete: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock, basePrisma: prismaMock }));
vi.mock("./connections", () => ({ loadConnection: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getNumericSetting: vi.fn(async () => 12) }));

import { loadConnection } from "./connections";
import { initiateCharge } from "./service";

beforeEach(() => vi.clearAllMocks());

describe("initiateCharge", () => {
  it("reserves a sale+charge and sends via the sandbox driver", async () => {
    prismaMock.paymentTerminal.findFirst.mockResolvedValue({ id: "t1", provider: "stone", device_external_id: "DEV1", mp_device_id: "DEV1", is_active: true });
    (loadConnection as any).mockResolvedValue({ provider: "stone", mode: "sandbox", status: "sandbox", credentials: {} });
    prismaMock.terminalCharge.findFirst.mockResolvedValue(null); // no active charge
    prismaMock.sale.create.mockResolvedValue({ id: "sale_1" });
    prismaMock.terminalCharge.create.mockResolvedValue({ id: "chg_1" });

    const res = await initiateCharge({ terminalId: "t1", method: "DEBIT", installments: 1, totalAmount: 1, items: [{ productId: "p1", quantity: 1, unitPrice: 1 }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.status).toBe("SENT");
    expect(prismaMock.terminalCharge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
  });

  it("rejects with DEVICE_BUSY when an active charge exists", async () => {
    prismaMock.paymentTerminal.findFirst.mockResolvedValue({ id: "t1", provider: "stone", device_external_id: "DEV1", mp_device_id: "DEV1", is_active: true });
    (loadConnection as any).mockResolvedValue({ provider: "stone", mode: "sandbox", status: "sandbox", credentials: {} });
    prismaMock.terminalCharge.findFirst.mockResolvedValue({ id: "busy" });
    const res = await initiateCharge({ terminalId: "t1", method: "DEBIT", installments: 1, totalAmount: 1, items: [{ productId: "p1", quantity: 1, unitPrice: 1 }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("DEVICE_BUSY");
  });

  it("rejects when the provider is not connected", async () => {
    prismaMock.paymentTerminal.findFirst.mockResolvedValue({ id: "t1", provider: "stone", device_external_id: "DEV1", mp_device_id: "DEV1", is_active: true });
    (loadConnection as any).mockResolvedValue(null);
    const res = await initiateCharge({ terminalId: "t1", method: "DEBIT", installments: 1, totalAmount: 1, items: [{ productId: "p1", quantity: 1, unitPrice: 1 }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFIG");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/service.test.ts`
Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/terminals/service.ts
import { prisma } from "@/lib/prisma";
import { getNumericSetting } from "@/lib/settings";
import { validateInstallments } from "@/lib/mercadopago/amount";
import { loadConnection } from "./connections";
import { resolveDriver } from "./registry";
import { finalizeTerminalCharge } from "./finalize";
import type { DriverResult, OperatorError } from "./types";
import type { TerminalChargeMethod } from "@prisma/client";

const CONFIG = (message: string): { ok: false; error: OperatorError } => ({ ok: false, error: { code: "CONFIG", message } });
const BUSY = (): { ok: false; error: OperatorError } => ({ ok: false, error: { code: "DEVICE_BUSY", message: "Maquininha ocupada — cancele a cobrança anterior." } });

export interface InitiateInput {
  terminalId: string;
  method: TerminalChargeMethod;
  installments: number;
  totalAmount: number;
  items: { productId: string; variantId?: string; quantity: number; unitPrice: number }[];
  customerId?: string;
}

export async function initiateCharge(input: InitiateInput): Promise<DriverResult<{ chargeId: string; status: "SENT" }>> {
  const terminal = await prisma.paymentTerminal.findFirst({ where: { id: input.terminalId, is_active: true } });
  if (!terminal) return CONFIG("Maquininha não encontrada.");

  const conn = await loadConnection(terminal.provider);
  if (!conn || conn.status === "disconnected") return CONFIG(`Provedor ${terminal.provider} não conectado.`);

  const driver = resolveDriver(conn);
  if (!driver.capabilities.methods.includes(input.method)) return CONFIG(`Método ${input.method} não suportado por ${terminal.provider}.`);
  if (input.installments > 1 && !driver.capabilities.installments) return CONFIG("Parcelamento não suportado.");

  if (input.method === "CREDIT") {
    const max = (await getNumericSetting("max_installments")) || 1;
    const check = validateInstallments(input.totalAmount, input.installments, max);
    if (!check.ok) return CONFIG(check.reason === "MIN_PARCELA" ? "Parcela mínima de R$5,00." : "Número de parcelas acima do permitido.");
  }

  const active = await prisma.terminalCharge.findFirst({ where: { terminal_id: terminal.id, status: { in: ["CREATED", "SENT", "PROCESSING"] } } });
  if (active) return BUSY();

  const sale = await prisma.sale.create({
    data: {
      status: "PENDING",
      payment_method: input.method === "PIX" ? "PIX" : "CARD",
      items: { create: input.items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, quantity: i.quantity, unit_price: i.unitPrice })) },
      ...(input.customerId ? { customer_id: input.customerId } : {}),
    },
  });

  const charge = await prisma.terminalCharge.create({
    data: {
      sale_id: sale.id, terminal_id: terminal.id, provider: terminal.provider,
      mp_order_id: `pending_${sale.id}`, external_order_id: null,
      amount: input.totalAmount, method: input.method, installments: input.installments, status: "CREATED",
    },
  });

  const created = await driver.createCharge(conn.credentials, {
    deviceExternalId: terminal.device_external_id ?? terminal.mp_device_id,
    amount: input.totalAmount, method: input.method, installments: input.installments, externalRef: charge.id,
  });

  if (!created.ok) {
    await prisma.terminalCharge.update({ where: { id: charge.id }, data: { status: "ERROR", error_code: created.error.code } });
    await prisma.sale.delete({ where: { id: sale.id } });
    return created;
  }

  await prisma.terminalCharge.update({ where: { id: charge.id }, data: { external_order_id: created.data.externalOrderId, mp_order_id: created.data.externalOrderId, status: "SENT" } });
  return { ok: true, data: { chargeId: charge.id, status: "SENT" } };
}

export async function pollCharge(chargeId: string): Promise<{ status: string; approved: boolean; saleId: string | null }> {
  const charge = await prisma.terminalCharge.findUnique({ where: { id: chargeId } });
  if (!charge) throw new Error("charge not found");
  if (["CREATED", "SENT", "PROCESSING"].includes(charge.status) && charge.external_order_id && !charge.external_order_id.startsWith("pending_")) {
    const conn = await loadConnection(charge.provider);
    if (conn) {
      const driver = resolveDriver(conn);
      const res = await driver.getChargeStatus(conn.credentials, charge.external_order_id);
      if (res.ok) {
        await finalizeTerminalCharge({ provider: charge.provider, externalOrderId: charge.external_order_id, status: res.data.status, externalPaymentId: res.data.externalPaymentId, cardBrand: res.data.cardBrand }).catch(() => {});
      }
    }
  }
  const fresh = await prisma.terminalCharge.findUnique({ where: { id: chargeId } });
  return { status: fresh!.status, approved: fresh!.status === "APPROVED", saleId: fresh!.sale_id };
}

export async function cancelCharge(chargeId: string): Promise<{ status: "CANCELED" }> {
  const charge = await prisma.terminalCharge.findUnique({ where: { id: chargeId } });
  if (charge && charge.external_order_id && !charge.external_order_id.startsWith("pending_")) {
    const conn = await loadConnection(charge.provider);
    if (conn) await resolveDriver(conn).cancelCharge(conn.credentials, charge.external_order_id).catch(() => {});
  }
  await prisma.terminalCharge.update({ where: { id: chargeId }, data: { status: "CANCELED", resolved_at: new Date() } });
  if (charge?.sale_id) await prisma.sale.update({ where: { id: charge.sale_id }, data: { status: "CANCELLED" } });
  return { status: "CANCELED" };
}
```

> Match the sale-item field names (`unit_price`, `customer_id`) and the `Sale.status` value for cancel (`CANCELLED`) to the existing `terminal-charge/route.ts` + schema exactly — copy them verbatim from the current route.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminals/service.ts src/lib/terminals/service.test.ts
git commit -m "feat: provider-neutral TerminalService (initiate/poll/cancel)"
```

### Task 6.3: Repoint the charge routes to the service

**Files:**
- Modify: `src/app/api/checkout/terminal-charge/route.ts`
- Modify: `src/app/api/checkout/terminal-charge/[id]/route.ts`
- Modify: `src/app/api/checkout/terminal-charge/[id]/cancel/route.ts`
- Modify: `src/app/api/checkout/terminal-charge/route.test.ts`

- [ ] **Step 1: Update the route test** to mock the service (keep the existing request/response contract: `{ chargeId, status }`, 409 on busy, 502 on driver error).

```ts
// add to src/app/api/checkout/terminal-charge/route.test.ts
vi.mock("@/lib/terminals/service", () => ({ initiateCharge: vi.fn() }));
// arrange initiateCharge -> { ok:true, data:{ chargeId:"chg_1", status:"SENT" } } and assert POST 200 body
// arrange initiateCharge -> { ok:false, error:{ code:"DEVICE_BUSY", message:"..." } } and assert POST 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/checkout/terminal-charge/route.test.ts`
Expected: FAIL — route still calls MP directly.

- [ ] **Step 3: Rewrite the POST handler as a thin controller** (keep the existing auth + Zod `terminalChargeSchema` parse into `input`)

```ts
// src/app/api/checkout/terminal-charge/route.ts
import { initiateCharge } from "@/lib/terminals/service";
// ...after auth + zod parse into `input`:
const result = await initiateCharge({
  terminalId: input.terminalId, method: input.method, installments: input.installments,
  totalAmount: input.totalAmount, items: input.items, customerId: input.customerId,
});
if (!result.ok) {
  const httpStatus = result.error.code === "DEVICE_BUSY" ? 409 : result.error.code === "CONFIG" ? 400 : 502;
  return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: httpStatus });
}
return NextResponse.json(result.data);
```

- [ ] **Step 4: Rewrite the `[id]` GET and `[id]/cancel` POST** as thin controllers (preserve existing auth checks):

```ts
// [id]/route.ts GET
import { pollCharge } from "@/lib/terminals/service";
const out = await pollCharge(params.id);
return NextResponse.json(out);

// [id]/cancel/route.ts POST
import { cancelCharge } from "@/lib/terminals/service";
return NextResponse.json(await cancelCharge(params.id));
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/app/api/checkout/terminal-charge/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/checkout/terminal-charge
git commit -m "refactor: charge routes delegate to TerminalService"
```

---

## Phase 7 — Webhooks generalization

### Task 7.1: `handleWebhook` in the service

**Files:**
- Modify: `src/lib/terminals/service.ts`
- Modify: `src/lib/terminals/service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to src/lib/terminals/service.test.ts
vi.mock("./finalize", () => ({ finalizeTerminalCharge: vi.fn() }));
vi.mock("@/lib/tenant/context", () => ({ runWithTenant: vi.fn(async (_t: string, fn: () => unknown) => fn()) }));
// extend prismaMock with providerConnection.findFirst
// import { handleWebhook } from "./service"; import { finalizeTerminalCharge } from "./finalize";
// arrange: basePrisma.providerConnection.findFirst -> { tenant_id:"tnt_1" }
//          loadConnection -> null (skip status re-resolve; sandbox parseWebhook already returns APPROVED)
// use provider "stone" so parseWebhook returns status APPROVED directly:
// const out = await handleWebhook("stone", {}, JSON.stringify({ externalOrderId: "ord_1", merchant_id: "m1" }));
// expect(out.received).toBe(true) and finalizeTerminalCharge called with status "APPROVED"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/service.test.ts`
Expected: FAIL — `handleWebhook` undefined.

- [ ] **Step 3: Implement `handleWebhook`** (append to `service.ts`)

```ts
// append imports at top of service.ts:
import { basePrisma } from "@/lib/prisma";
import { runWithTenant } from "@/lib/tenant/context";
import { mercadoPagoDriver } from "./drivers/mercadopago";
import { stoneDriver } from "./drivers/stone";
import { connectTefDriver } from "./drivers/connecttef";
import type { TerminalProviderName } from "@prisma/client";

const DRIVERS_BY_NAME = { mercadopago: mercadoPagoDriver, stone: stoneDriver, connecttef: connectTefDriver };

export async function handleWebhook(provider: TerminalProviderName, headers: Record<string, string>, rawBody: string): Promise<{ received: boolean }> {
  const driver = DRIVERS_BY_NAME[provider];
  if (!driver.verifyWebhook(headers, rawBody)) return { received: false };

  let body: unknown;
  try { body = JSON.parse(rawBody || "{}"); } catch { return { received: false }; }
  const parsed = await driver.parseWebhook(headers, body);
  if (!parsed.ok) return { received: false };
  const res = parsed.data;

  // resolve tenant via the hint (external_account_id) using the unscoped client
  let tenantId: string | null = null;
  if (res.tenantHint?.key === "external_account_id") {
    const conn = await basePrisma.providerConnection.findFirst({ where: { provider, external_account_id: res.tenantHint.value } });
    tenantId = conn?.tenant_id ?? null;
  }
  if (!tenantId) {
    const charge = await basePrisma.terminalCharge.findFirst({ where: { provider, external_order_id: res.externalOrderId } });
    tenantId = charge?.tenant_id ?? null;
  }
  if (!tenantId) return { received: false };

  await runWithTenant(tenantId, async () => {
    let status = res.status, paymentId = res.externalPaymentId, cardBrand = res.cardBrand;
    // Some providers (MP) only send ids → re-resolve status with tenant creds.
    if (status === "PROCESSING") {
      const conn = await loadConnection(provider);
      if (conn) {
        const live = await resolveDriver(conn).getChargeStatus(conn.credentials, res.externalOrderId);
        if (live.ok) { status = live.data.status; paymentId = live.data.externalPaymentId; cardBrand = live.data.cardBrand; }
      }
    }
    await finalizeTerminalCharge({ provider, externalOrderId: res.externalOrderId, status, externalPaymentId: paymentId, cardBrand });
  });
  return { received: true };
}
```

> Confirm `runWithTenant`'s signature against `src/lib/tenant/context.ts` (referenced by the explorer). If it is `runWithTenant(tenantId)(fn)` or takes an object, adapt the call site + the test mock accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/terminals/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/terminals/service.ts src/lib/terminals/service.test.ts
git commit -m "feat: provider-neutral webhook handling with tenant resolution"
```

### Task 7.2: Generic webhook route + repoint MP route

**Files:**
- Create: `src/app/api/webhooks/terminal/[provider]/route.ts`
- Modify: `src/app/api/webhooks/mercadopago/route.ts`

- [ ] **Step 1: Create the generic route**

```ts
// src/app/api/webhooks/terminal/[provider]/route.ts
import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/terminals/service";
import type { TerminalProviderName } from "@prisma/client";

const ALLOWED = new Set(["mercadopago", "stone", "connecttef"]);

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  if (!ALLOWED.has(params.provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  const out = await handleWebhook(params.provider as TerminalProviderName, headers, rawBody);
  return NextResponse.json(out, { status: out.received ? 200 : 401 });
}
```

- [ ] **Step 2: Repoint the existing MP webhook** — in `src/app/api/webhooks/mercadopago/route.ts`, read the raw body + headers and, for the terminal `order` topic, delegate to `handleWebhook("mercadopago", …)`. Keep the legacy `payment`-topic (Checkout Pro) branch untouched.

```ts
// inside POST:
const rawBody = await req.text();
const headers: Record<string, string> = {};
req.headers.forEach((v, k) => (headers[k] = v));
const parsedBody = JSON.parse(rawBody || "{}");
// if the topic is the terminal order topic:
if (parsedBody?.topic === "order" || parsedBody?.type === "order" || parsedBody?.action?.startsWith("order")) {
  const out = await handleWebhook("mercadopago", headers, rawBody);
  return NextResponse.json(out, { status: out.received ? 200 : 401 });
}
// else fall through to the existing payment-topic (legacy) branch, using parsedBody
```

> Preserve whatever topic-detection the current handler uses; only the `order` branch is delegated. If the handler currently reads `await req.json()`, switch it to the `rawBody`+`JSON.parse` shown so the signature check still has the raw body.

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks
git commit -m "feat: generic terminal webhook route + MP delegation"
```

### Task 7.3: Dev-only sandbox webhook trigger

**Files:**
- Create: `src/app/api/dev/terminal/simulate-webhook/route.ts`

- [ ] **Step 1: Implement (guarded by NODE_ENV)**

```ts
// src/app/api/dev/terminal/simulate-webhook/route.ts
import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/terminals/service";
import type { TerminalProviderName } from "@prisma/client";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const { provider, externalOrderId } = await req.json();
  const body = JSON.stringify({ externalOrderId });
  const out = await handleWebhook(provider as TerminalProviderName, { "content-type": "application/json" }, body);
  return NextResponse.json(out);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/api/dev/terminal/simulate-webhook/route.ts
git commit -m "feat: dev-only sandbox webhook trigger"
```

---

## Phase 8 — Stone driver (sandbox-first)

> Built against Stone Connect 2.0 / Pagar.me v5 public API shapes. `mode` stays `sandbox` in production until homologação; the real HTTP paths below are validated live only after credentials land (spec §15). Replaces the Phase 5 stub.

### Task 8.1: Stone client + driver

**Files:**
- Create: `src/lib/stone/client.ts`
- Modify (replace stub): `src/lib/terminals/drivers/stone.ts`
- Test: `src/lib/terminals/drivers/stone.test.ts`

- [ ] **Step 1: Write the failing test** (mock the Stone client)

```ts
// src/lib/terminals/drivers/stone.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/stone/client", () => ({ stoneFetch: vi.fn() }));
import { stoneFetch } from "@/lib/stone/client";
import { stoneDriver } from "./stone";

const creds = { apiKey: "sk_test", merchantId: "mrc_1" };
beforeEach(() => vi.clearAllMocks());

describe("stoneDriver", () => {
  it("creates a charge and normalizes status", async () => {
    (stoneFetch as any).mockResolvedValue({ id: "so_1", status: "pending" });
    const res = await stoneDriver.createCharge(creds, { deviceExternalId: "D1", amount: 12.5, method: "CREDIT", installments: 2, externalRef: "chg_1" });
    expect(res.ok && res.data.externalOrderId).toBe("so_1");
    expect(res.ok && res.data.status).toBe("PROCESSING");
  });
  it("maps failures to OperatorError", async () => {
    (stoneFetch as any).mockRejectedValue(Object.assign(new Error("x"), { status: 403 }));
    const res = await stoneDriver.createCharge(creds, { deviceExternalId: "D1", amount: 1, method: "DEBIT", installments: 1, externalRef: "chg_1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("CONFIG");
  });
  it("declares Stone capabilities", () => {
    expect(stoneDriver.capabilities.methods).toContain("CREDIT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/drivers/stone.test.ts`
Expected: FAIL (stub returns a sandbox `sbx_…` id, not `so_1`).

- [ ] **Step 3: Implement the Stone client + driver**

```ts
// src/lib/stone/client.ts
const BASE = process.env.STONE_API_BASE ?? "https://api.pagar.me/core/v5";
export class StoneApiError extends Error { constructor(public status: number, body: string) { super(body); } }
export async function stoneFetch(path: string, init: RequestInit & { apiKey: string }): Promise<any> {
  const { apiKey, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/json", ...(headers as Record<string, string> | undefined) },
  });
  if (!res.ok) throw new StoneApiError(res.status, await res.text());
  return res.json();
}
```

```ts
// src/lib/terminals/drivers/stone.ts
import { stoneFetch } from "@/lib/stone/client";
import { normalizeChargeStatus } from "../status";
import type { TerminalDriver, DriverResult, ProviderCharge, ProviderCredentials, WebhookResolution, OperatorError } from "../types";

function apiKey(c: ProviderCredentials) { return String(c.apiKey ?? ""); }
function toOperatorError(err: any): OperatorError {
  const status = err?.status;
  if (status === 409) return { code: "DEVICE_BUSY", message: "Maquininha ocupada." };
  if (status === 403) return { code: "CONFIG", message: "Credenciais Stone inválidas." };
  if (typeof status === "number") return { code: "GENERIC", message: "Erro ao comunicar com a Stone." };
  return { code: "OFFLINE", message: "Maquininha sem conexão." };
}

export const stoneDriver: TerminalDriver = {
  name: "stone",
  capabilities: { deviceSync: false, operatingModes: false, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"] },

  async createCharge(creds, input): Promise<DriverResult<ProviderCharge>> {
    try {
      // Stone Connect: create a remote order routed to the paired device.
      const order = await stoneFetch("/orders", {
        method: "POST", apiKey: apiKey(creds),
        body: JSON.stringify({
          items: [{ amount: Math.round(input.amount * 100), description: "PDV", quantity: 1 }],
          device_id: input.deviceExternalId,
          code: input.externalRef,
          payments: [{ payment_method: input.method.toLowerCase(), installments: input.installments }],
        }),
      });
      return { ok: true, data: { externalOrderId: order.id, status: normalizeChargeStatus(order.status ?? "pending"), raw: order } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async getChargeStatus(creds, externalOrderId): Promise<DriverResult<ProviderCharge>> {
    try {
      const order = await stoneFetch(`/orders/${externalOrderId}`, { method: "GET", apiKey: apiKey(creds) });
      const charge = order?.charges?.[0] ?? {};
      return { ok: true, data: { externalOrderId, externalPaymentId: charge.id, status: normalizeChargeStatus(charge.status ?? order.status ?? "processing"), cardBrand: charge?.last_transaction?.card?.brand, raw: order } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async cancelCharge(creds, externalOrderId): Promise<DriverResult<void>> {
    try { await stoneFetch(`/orders/${externalOrderId}/closed`, { method: "PATCH", apiKey: apiKey(creds), body: JSON.stringify({ status: "canceled" }) }); return { ok: true, data: undefined }; }
    catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  verifyWebhook(headers, rawBody, creds) {
    // Pagar.me signs webhooks with an HMAC in `x-hub-signature`; verify when a secret is present.
    const sig = headers["x-hub-signature"];
    const secret = creds ? String((creds as any).webhookSecret ?? "") : "";
    if (!sig || !secret) return true; // sandbox / unset secret
    const { createHmac } = require("crypto");
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    return sig === expected;
  },

  async parseWebhook(_headers, body: any): Promise<DriverResult<WebhookResolution>> {
    const order = body?.data ?? body;
    const orderId = order?.id;
    if (!orderId) return { ok: false, error: { code: "GENERIC", message: "webhook Stone sem id" } };
    const charge = order?.charges?.[0] ?? {};
    return { ok: true, data: { providerName: "stone", externalOrderId: String(orderId), externalPaymentId: charge.id, status: normalizeChargeStatus(charge.status ?? order.status ?? "processing"), cardBrand: charge?.last_transaction?.card?.brand, tenantHint: order?.merchant_id ? { key: "external_account_id", value: String(order.merchant_id) } : undefined } };
  },
};
```

> The exact `/orders` payload and webhook signature header are per Stone Connect 2.0 / Pagar.me v5 public docs and must be confirmed at homologação (spec §15). Until then the driver is exercised only via the sandbox + these unit tests.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/lib/terminals/drivers/stone.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stone src/lib/terminals/drivers/stone.ts src/lib/terminals/drivers/stone.test.ts
git commit -m "feat: Stone Connect terminal driver (sandbox-first)"
```

---

## Phase 9 — ConnectTEF driver (sandbox-first)

> ConnectTEF is a SmartTEF middleware: one HTTP API routes to the merchant's Android SmartPOS running the agent. `deviceSync:false`. `mode` stays `sandbox` until a commercial contract + endpoint are provisioned (spec §15). Replaces the Phase 5 stub.

### Task 9.1: ConnectTEF client + driver

**Files:**
- Create: `src/lib/connecttef/client.ts`
- Modify (replace stub): `src/lib/terminals/drivers/connecttef.ts`
- Test: `src/lib/terminals/drivers/connecttef.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/terminals/drivers/connecttef.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/connecttef/client", () => ({ connectTefFetch: vi.fn() }));
import { connectTefFetch } from "@/lib/connecttef/client";
import { connectTefDriver } from "./connecttef";

const creds = { endpoint: "https://tef.example", agentToken: "at_1", merchantId: "m1" };
beforeEach(() => vi.clearAllMocks());

describe("connectTefDriver", () => {
  it("creates a transaction and normalizes status", async () => {
    (connectTefFetch as any).mockResolvedValue({ transactionId: "tx_1", status: "processing" });
    const res = await connectTefDriver.createCharge(creds, { deviceExternalId: "POS1", amount: 20, method: "CREDIT", installments: 1, externalRef: "chg_1" });
    expect(res.ok && res.data.externalOrderId).toBe("tx_1");
    expect(res.ok && res.data.status).toBe("PROCESSING");
  });
  it("has deviceSync=false and no listDevices", () => {
    expect(connectTefDriver.capabilities.deviceSync).toBe(false);
    expect(connectTefDriver.listDevices).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/terminals/drivers/connecttef.test.ts`
Expected: FAIL (stub returns a sandbox id).

- [ ] **Step 3: Implement the client + driver**

```ts
// src/lib/connecttef/client.ts
export class ConnectTefApiError extends Error { constructor(public status: number, body: string) { super(body); } }
export async function connectTefFetch(endpoint: string, path: string, init: RequestInit & { agentToken: string }): Promise<any> {
  const { agentToken, headers, ...rest } = init;
  const res = await fetch(`${endpoint}${path}`, { ...rest, headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json", ...(headers as Record<string, string> | undefined) } });
  if (!res.ok) throw new ConnectTefApiError(res.status, await res.text());
  return res.json();
}
```

```ts
// src/lib/terminals/drivers/connecttef.ts
import { connectTefFetch } from "@/lib/connecttef/client";
import { normalizeChargeStatus } from "../status";
import type { TerminalDriver, DriverResult, ProviderCharge, ProviderCredentials, WebhookResolution, OperatorError } from "../types";

function cfg(c: ProviderCredentials) { return { endpoint: String(c.endpoint ?? ""), agentToken: String(c.agentToken ?? ""), merchantId: String(c.merchantId ?? "") }; }
function toOperatorError(err: any): OperatorError {
  if (err?.status === 409) return { code: "DEVICE_BUSY", message: "Terminal ocupado." };
  if (err?.status === 401 || err?.status === 403) return { code: "CONFIG", message: "Agente ConnectTEF não autorizado." };
  if (typeof err?.status === "number") return { code: "GENERIC", message: "Erro no ConnectTEF." };
  return { code: "OFFLINE", message: "SmartPOS sem conexão." };
}

export const connectTefDriver: TerminalDriver = {
  name: "connecttef",
  capabilities: { deviceSync: false, operatingModes: false, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"] },

  async createCharge(creds, input): Promise<DriverResult<ProviderCharge>> {
    const { endpoint, agentToken, merchantId } = cfg(creds);
    try {
      const tx = await connectTefFetch(endpoint, "/transactions", {
        method: "POST", agentToken,
        body: JSON.stringify({ merchant_id: merchantId, pos_id: input.deviceExternalId, amount_cents: Math.round(input.amount * 100), payment_type: input.method.toLowerCase(), installments: input.installments, reference: input.externalRef }),
      });
      return { ok: true, data: { externalOrderId: tx.transactionId, status: normalizeChargeStatus(tx.status ?? "processing"), raw: tx } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async getChargeStatus(creds, externalOrderId): Promise<DriverResult<ProviderCharge>> {
    const { endpoint, agentToken } = cfg(creds);
    try {
      const tx = await connectTefFetch(endpoint, `/transactions/${externalOrderId}`, { method: "GET", agentToken });
      return { ok: true, data: { externalOrderId, externalPaymentId: tx.nsu ?? tx.authorizationCode, status: normalizeChargeStatus(tx.status ?? "processing"), cardBrand: tx.cardBrand, raw: tx } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async cancelCharge(creds, externalOrderId): Promise<DriverResult<void>> {
    const { endpoint, agentToken } = cfg(creds);
    try { await connectTefFetch(endpoint, `/transactions/${externalOrderId}/cancel`, { method: "POST", agentToken }); return { ok: true, data: undefined }; }
    catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  verifyWebhook() { return true; }, // ConnectTEF agent posts over TLS; add HMAC when the contract specifies one

  async parseWebhook(_headers, body: any): Promise<DriverResult<WebhookResolution>> {
    const txId = body?.transactionId ?? body?.data?.transactionId;
    if (!txId) return { ok: false, error: { code: "GENERIC", message: "webhook ConnectTEF sem id" } };
    return { ok: true, data: { providerName: "connecttef", externalOrderId: String(txId), externalPaymentId: body?.nsu, status: normalizeChargeStatus(body?.status ?? "processing"), cardBrand: body?.cardBrand, tenantHint: body?.merchant_id ? { key: "external_account_id", value: String(body.merchant_id) } : undefined } };
  },
};
```

> Endpoint paths, field names, and webhook auth are per ConnectTEF (SmartTEF) API docs and require confirmation at contract time (spec §15). Exercised via sandbox + unit tests until then.

- [ ] **Step 4: Run test + typecheck + full suite**

Run: `npx vitest run src/lib/terminals/drivers/connecttef.test.ts && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connecttef src/lib/terminals/drivers/connecttef.ts src/lib/terminals/drivers/connecttef.test.ts
git commit -m "feat: ConnectTEF terminal driver (sandbox-first)"
```

---

## Phase 10 — Picker UI

### Task 10.1: Provider-connection settings API

**Files:**
- Create: `src/app/api/settings/providers/route.ts` (GET list, POST upsert)
- Create: `src/app/api/settings/providers/[provider]/route.ts` (PATCH mode, DELETE disconnect)

- [ ] **Step 1: Implement the list + upsert route** (admin-guarded; credentials encrypted on write, never returned)

```ts
// src/app/api/settings/providers/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptJson } from "@/lib/crypto/secretbox";
import { requireAdminSession } from "@/lib/auth"; // use the repo's actual admin guard (match other admin routes)

const upsertSchema = z.object({
  provider: z.enum(["mercadopago", "stone", "connecttef"]),
  mode: z.enum(["sandbox", "live"]).default("sandbox"),
  credentials: z.record(z.string(), z.unknown()),
  externalAccountId: z.string().optional(),
});

export async function GET() {
  await requireAdminSession();
  const rows = await prisma.providerConnection.findMany();
  return NextResponse.json(rows.map((r) => ({ provider: r.provider, mode: r.mode, status: r.status, externalAccountId: r.external_account_id })));
}

export async function POST(req: Request) {
  await requireAdminSession();
  const input = upsertSchema.parse(await req.json());
  const status = input.mode === "live" ? "live" : "sandbox";
  const data = { mode: input.mode, status, credentials: encryptJson(input.credentials), external_account_id: input.externalAccountId } as const;
  const existing = await prisma.providerConnection.findFirst({ where: { provider: input.provider } });
  if (existing) await prisma.providerConnection.update({ where: { id: existing.id }, data });
  else await prisma.providerConnection.create({ data: { provider: input.provider, ...data } });
  return NextResponse.json({ ok: true });
}
```

> Replace `requireAdminSession` with the actual admin/session guard used by the existing terminals/settings API routes (confirm the helper name in `src/lib/auth.ts`). Use `findFirst`+`update`/`create` (not compound-unique upsert) so the tenant-scoped client injects `tenant_id` cleanly.

- [ ] **Step 2: Implement PATCH/DELETE** in `[provider]/route.ts`:

```ts
// src/app/api/settings/providers/[provider]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

export async function PATCH(req: Request, { params }: { params: { provider: string } }) {
  await requireAdminSession();
  const { mode } = await req.json();
  const row = await prisma.providerConnection.findFirst({ where: { provider: params.provider as any } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.providerConnection.update({ where: { id: row.id }, data: { mode, status: mode === "live" ? "live" : "sandbox" } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { provider: string } }) {
  await requireAdminSession();
  const row = await prisma.providerConnection.findFirst({ where: { provider: params.provider as any } });
  if (row) await prisma.providerConnection.update({ where: { id: row.id }, data: { status: "disconnected" } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/api/settings/providers
git commit -m "feat: provider-connection settings API"
```

### Task 10.2: Providers section in the terminals page

**Files:**
- Modify: `src/app/(app)/settings/terminals/page.tsx`

- [ ] **Step 1: Add a Providers panel** above the terminal list:
  - Fetch `GET /api/settings/providers`; render one card per provider (`mercadopago | stone | connecttef`) with a status pill (`disconnected|sandbox|live|error`) and a mode toggle (sandbox/live → `PATCH /api/settings/providers/[provider]`).
  - Credential entry per provider: MP keeps its existing OAuth connect button; Stone → API-key + merchant-id form; ConnectTEF → endpoint + agent-token + merchant-id form. On submit → `POST /api/settings/providers`.
  - A store-default `<select>` writing `default_terminal_provider` via the existing settings endpoint used by the page.

- [ ] **Step 2: Provider-aware terminal rows** — show a provider badge per terminal; the "add terminal" flow preselects the store default; render the existing "Sync devices" button only when the provider supports it. Add a client constant mirroring driver capabilities:

```ts
const PROVIDER_DEVICE_SYNC: Record<string, boolean> = { mercadopago: true, stone: false, connecttef: false };
```

- [ ] **Step 3: Manual verification (dev)**

Run the app in development; connect a Stone provider in **sandbox**, add a terminal on it, run the "Teste de cobrança R$1,00" → SENT → (poll) → APPROVED after ~4s via the sandbox driver.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings/terminals/page.tsx"
git commit -m "feat: provider picker UI in terminals settings"
```

### Task 10.3: Repoint terminal device-sync to the driver

**Files:**
- Modify: `src/app/api/terminals/sync/route.ts`

- [ ] **Step 1:** Replace the direct `listDevices()`/`setOperatingMode()` MP calls with the resolved driver's capability-gated methods: load the tenant's `mercadopago` `ProviderConnection`, `resolveDriver`, guard on `driver.capabilities.deviceSync` (return a clear 400 `CONFIG`-style error if false), then call `driver.listDevices?.(creds)` / `driver.setOperatingMode?.(creds, …)` and upsert as today.

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/api/terminals/sync/route.ts
git commit -m "refactor: device sync via driver capabilities"
```

---

## Phase 11 — Cleanup migration + e2e

### Task 11.1: Drop deprecated MP-specific columns and `MpConnection`

> Run ONLY after the switchover is verified in production and the backfill (Task 2.2) has run against prod. Because prod=dev share one DB, coordinate this as a discrete change window.

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/terminals/service.ts`, `src/lib/terminals/finalize.ts`

- [ ] **Step 1:** Make `external_order_id` / `device_external_id` **NOT NULL**; remove `mp_device_id`, `mp_order_id`, `mp_payment_id` from `PaymentTerminal`/`TerminalCharge`; delete the `MpConnection` model + the `Tenant.mp_connection` relation. In `service.ts` drop the transitional `mp_order_id` writes (the `create` and `update` calls); in `finalize.ts` rename the `salePayment.create` field `mp_payment_id` if that column is renamed (keep it — `SalePayment.mp_payment_id` is a separate, still-valid column unless you also generalize it; leave `SalePayment` unchanged).

- [ ] **Step 2:** `npx prisma db push` (accept the column drops — data already migrated) `&& npx prisma generate`.

- [ ] **Step 3:** Retire `src/lib/mercadopago/finalize.ts` if nothing references it (the webhook now uses the generalized finalizer). Keep `orders/devices/errors/checkout/amount/client` as MP driver internals.

- [ ] **Step 4: Full suite + typecheck + commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add prisma/schema.prisma src/lib
git commit -m "chore: drop deprecated MP-specific columns and MpConnection"
```

### Task 11.2: E2E — sandbox provider charge

**Files:**
- Create: `e2e/terminal-picker.spec.ts`

- [ ] **Step 1: Write the Playwright test** (adjust selectors to the Task 10.2 UI labels)

```ts
// e2e/terminal-picker.spec.ts
import { test, expect } from "@playwright/test";

test("connect a sandbox provider and run a test charge to approval", async ({ page }) => {
  await page.goto("/settings/terminals");
  await page.getByRole("button", { name: /conectar stone/i }).click();
  await page.getByLabel(/api key/i).fill("sk_sandbox");
  await page.getByRole("button", { name: /salvar/i }).click();
  await expect(page.getByText(/sandbox/i)).toBeVisible();
  await page.getByRole("button", { name: /teste de cobrança/i }).first().click();
  await expect(page.getByText(/aprovad/i)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- e2e/terminal-picker.spec.ts`
Expected: PASS (sandbox auto-approves within the timeout).

- [ ] **Step 3: Commit**

```bash
git add e2e/terminal-picker.spec.ts
git commit -m "test: e2e sandbox provider charge to approval"
```

---

## Self-Review

**Spec coverage** (spec §→plan):
- §5 architecture → Phases 1,4–6. ✅
- §6 driver contract → Task 1.2. ✅
- §7 registry + sandbox → Phase 5. ✅
- §8 data model → Phase 2. ✅
- §9 encryption → Phase 0 + used in Tasks 2.2, 3.1, 10.1. ✅
- §10 service + finalize → Phase 6. ✅
- §11 webhooks → Phase 7. ✅
- §12 drivers (MP/Stone/ConnectTEF/sandbox) → Phases 4,5,8,9. ✅
- §13 picker UI → Phase 10. ✅
- §14 error handling / testing / rollout / entitlements → `OperatorError` mapping in every driver + service; unit/conformance/e2e across phases; additive-then-drop rollout (Phase 2 → Phase 11); entitlements left table-stakes (no gating task — matches "deferred"). ✅
- §15 open items → called out inline in Phase 4 (env-token), Phase 7 (`runWithTenant` signature), Phases 8–9 (external-API confirmation). ✅
- §16 file manifest → matches the File Structure section. ✅

**Placeholder scan:** No "TBD/implement later" steps. External Stone/ConnectTEF payloads are real documented shapes flagged "confirm at homologação/contract" — known-unknowns, not placeholders. UI Task 10.2 lists concrete actions/endpoints per element.

**Type consistency:** `TerminalDriver`, `DriverResult`, `ProviderCharge`, `WebhookResolution`, `CreateChargeInput`, `DriverCapabilities`, `ProviderCredentials`, `OperatorError` are defined once (Task 1.2) and used verbatim by every driver, the registry, and the service. `finalizeTerminalCharge(FinalizeInput)`, `loadConnection`/`LoadedConnection`, `resolveDriver(conn)`, `initiateCharge`/`pollCharge`/`cancelCharge`/`handleWebhook` names are stable across Phases 3–11. Sandbox order-id format `sbx_<ref>_<epochMs>` is produced in `createCharge` and parsed in `getChargeStatus` consistently.

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

> This plan is **buildable now** for the MP + sandbox path; Stone/ConnectTEF live activation is gated on partnership credentials (their drivers ship sandbox-first). Recommended first mergeable increment: **end of Phase 7** — the full abstraction proven end-to-end on MP + sandbox with generalized webhooks. Phases 8–11 follow as credentials and rollout windows allow.
