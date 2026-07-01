import { describe, it, expect, vi, beforeEach } from "vitest";
const findFirst = vi.fn();
const txCreateTenant = vi.fn();
const txCreateUser = vi.fn();
vi.mock("@/lib/prisma", () => ({
  basePrisma: {
    tenant: { findFirst: (a: unknown) => findFirst(a) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      tenant: { create: (a: unknown) => txCreateTenant(a) },
      user: { create: (a: unknown) => txCreateUser(a) },
    }),
  },
}));
import { uniqueSlug, createTenantWithAdmin } from "./provision";

beforeEach(() => { findFirst.mockReset(); txCreateTenant.mockReset(); txCreateUser.mockReset(); });

describe("uniqueSlug", () => {
  it("returns base when free", async () => {
    findFirst.mockResolvedValue(null);
    expect(await uniqueSlug("loja-x")).toBe("loja-x");
  });
  it("appends -2, -3 until free", async () => {
    findFirst.mockResolvedValueOnce({ id: "1" }).mockResolvedValueOnce({ id: "2" }).mockResolvedValueOnce(null);
    expect(await uniqueSlug("loja-x")).toBe("loja-x-3");
  });
});

describe("createTenantWithAdmin", () => {
  it("creates tenant then admin in a transaction with the given fields", async () => {
    findFirst.mockResolvedValue(null);
    txCreateTenant.mockResolvedValue({ id: "t1", slug: "loja-x", plan: "pro" });
    txCreateUser.mockResolvedValue({ id: "u1", email: "a@b.com" });
    const trial = new Date("2026-07-07T00:00:00Z");
    const res = await createTenantWithAdmin({ name: "Loja X", slugBase: "loja-x", email: "a@b.com", passwordHash: "h", plan: "pro", paidUntil: trial });
    expect(txCreateTenant).toHaveBeenCalledWith({ data: { name: "Loja X", slug: "loja-x", plan: "pro", paid_until: trial } });
    expect(txCreateUser).toHaveBeenCalledWith({ data: { name: "Administrador", email: "a@b.com", password: "h", role: "ADMIN", tenant_id: "t1" } });
    expect(res).toEqual({ tenantId: "t1", slug: "loja-x", userId: "u1" });
  });
});
