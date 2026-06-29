process.env.SESSION_SECRET ||= "test-secret";

/**
 * Tests the ALS fallback path of resolveTenantId().
 *
 * next/headers is mocked to throw (simulating a non-request scope such as a
 * cron or runWithTenant call). The resolver should fall through to
 * getTenantIdOrNull() and return the tenantId bound by runWithTenant().
 */

import { describe, it, expect, vi } from "vitest";

// Make cookies() throw so the cookie-first path is skipped.
vi.mock("next/headers", () => ({
  cookies: () => {
    throw new Error("Not in a request scope");
  },
}));

// Stub @/lib/auth to avoid loading the real module (which would pull in
// prisma → resolve-tenant → circular at load time in the test harness).
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE: "zf_session",
  parseSessionToken: () => null,
}));

import { runWithTenant } from "./context";
import { resolveTenantId } from "./resolve-tenant";

describe("resolveTenantId — ALS fallback", () => {
  it("returns the tenantId from runWithTenant when not in a request scope", async () => {
    const result = await runWithTenant("t1", () => resolveTenantId());
    expect(result).toBe("t1");
  });

  it("throws when neither cookie nor ALS context is available", async () => {
    await expect(resolveTenantId()).rejects.toThrow(/No tenant context/);
  });
});
