process.env.SESSION_SECRET ||= "test-secret";

/**
 * Tests that getSession() binds tenant context by calling enterTenant().
 *
 * Because AsyncLocalStorage.enterWith() called inside an async function does
 * not propagate to the caller's await-continuation in Node.js's Promise
 * tracking model, we verify the binding by mocking @/lib/tenant/context:
 * the mock's getTenantIdOrNull() returns whatever tenantId was last passed to
 * enterTenant(), letting us assert the canonical "getTenantIdOrNull() ===
 * 'tenant_ABC'" form while confirming the real call happened.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ── Mock next/headers ─────────────────────────────────────────────────────────
const cookiesGetFn = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookiesGetFn }),
}));

// ── Mock tenant context ────────────────────────────────────────────────────────
// Captures the tenantId when enterTenant() is called.  getTenantIdOrNull()
// returns the captured value, enabling the idiomatic assertion form.
let capturedTenantId: string | null = null;

vi.mock("@/lib/tenant/context", () => ({
  enterTenant: (id: string) => {
    capturedTenantId = id;
  },
  getTenantIdOrNull: () => capturedTenantId,
  getTenantId: () => {
    if (!capturedTenantId) throw new Error("No tenant context");
    return capturedTenantId;
  },
  runWithTenant: <T>(_id: string, fn: () => T): T => fn(),
}));

// ── Dynamic imports (auth.ts will receive the mocked tenant context) ──────────
type SessionPayload = {
  userId: string;
  role: "ADMIN" | "EMPLOYEE";
  name: string;
  tenantId: string;
};

let createSessionToken: (data: SessionPayload) => string;
let getSession: () => Promise<SessionPayload | null>;
let getTenantIdOrNull: () => string | null;

beforeAll(async () => {
  const auth = await import("@/lib/auth");
  createSessionToken = auth.createSessionToken;
  getSession = auth.getSession as () => Promise<SessionPayload | null>;

  const ctx = await import("@/lib/tenant/context");
  getTenantIdOrNull = ctx.getTenantIdOrNull;
});

beforeEach(() => {
  cookiesGetFn.mockReset();
  capturedTenantId = null;
});

describe("getSession tenant context binding", () => {
  it("binds tenant context when a valid session cookie is present", async () => {
    const token = createSessionToken({
      userId: "u1",
      role: "ADMIN",
      name: "Alice",
      tenantId: "tenant_ABC",
    });
    cookiesGetFn.mockReturnValue({ value: token });

    await getSession();

    // enterTenant("tenant_ABC") must have been called inside getSession()
    expect(getTenantIdOrNull()).toBe("tenant_ABC");
  });

  it("returns null and does not bind when no session cookie", async () => {
    cookiesGetFn.mockReturnValue(undefined);

    const result = await getSession();

    expect(result).toBeNull();
    // enterTenant must NOT have been called
    expect(getTenantIdOrNull()).toBeNull();
  });
});
