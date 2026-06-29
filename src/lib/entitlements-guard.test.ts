import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const findUnique = vi.fn();
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });

vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/prisma", () => ({ basePrisma: { tenant: { findUnique: (a: unknown) => findUnique(a) } } }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import { currentPlan, requireEntitlement, requireEntitlementPage } from "./entitlements-guard";

beforeEach(() => { getSession.mockReset(); findUnique.mockReset(); redirect.mockClear(); });

describe("currentPlan", () => {
  it("returns null when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    expect(await currentPlan()).toBeNull();
  });
  it("returns the tenant's plan from DB", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "pro" });
    expect(await currentPlan()).toBe("pro");
  });
  it("normalizes a null plan to basic (fail-closed)", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: null });
    expect(await currentPlan()).toBe("basic");
  });
});

describe("requireEntitlement", () => {
  it("401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await requireEntitlement("whatsapp");
    expect(res?.status).toBe(401);
  });
  it("403 when plan lacks the key", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "basic" });
    const res = await requireEntitlement("whatsapp");
    expect(res?.status).toBe(403);
  });
  it("null (pass) when plan has the key", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "pro" });
    expect(await requireEntitlement("whatsapp")).toBeNull();
  });
});

describe("requireEntitlementPage", () => {
  it("redirects to /upgrade when plan lacks the key", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "basic" });
    await expect(requireEntitlementPage("fiscal.nfce")).rejects.toThrow("REDIRECT:/upgrade?feature=fiscal.nfce");
  });
  it("does not redirect when entitled", async () => {
    getSession.mockResolvedValue({ tenantId: "t1" });
    findUnique.mockResolvedValue({ plan: "pro" });
    await requireEntitlementPage("fiscal.nfce");
    expect(redirect).not.toHaveBeenCalled();
  });
});
