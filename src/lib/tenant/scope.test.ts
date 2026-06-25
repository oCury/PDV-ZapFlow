import { describe, it, expect } from "vitest";
import { applyTenantScope, TENANT_MODELS } from "./scope";

const T = "tenant_1";

describe("applyTenantScope", () => {
  it("stamps tenant_id on create.data", () => {
    const out = applyTenantScope("create", { data: { name: "x" } }, T);
    expect(out.data).toEqual({ name: "x", tenant_id: T });
  });

  it("stamps tenant_id on every row of createMany", () => {
    const out = applyTenantScope("createMany", { data: [{ a: 1 }, { a: 2 }] }, T);
    expect(out.data).toEqual([{ a: 1, tenant_id: T }, { a: 2, tenant_id: T }]);
  });

  it("injects tenant_id into where on findMany", () => {
    const out = applyTenantScope("findMany", { where: { active: true } }, T);
    expect(out.where).toEqual({ active: true, tenant_id: T });
  });

  it("injects tenant_id into where on findUnique (Prisma 6 allows extra filters)", () => {
    const out = applyTenantScope("findUnique", { where: { id: "p1" } }, T);
    expect(out.where).toEqual({ id: "p1", tenant_id: T });
  });

  it("injects tenant_id into where on update and delete", () => {
    expect(applyTenantScope("update", { where: { id: "p1" }, data: {} }, T).where)
      .toEqual({ id: "p1", tenant_id: T });
    expect(applyTenantScope("delete", { where: { id: "p1" } }, T).where)
      .toEqual({ id: "p1", tenant_id: T });
  });

  it("scopes both where and create on upsert", () => {
    const out = applyTenantScope("upsert", { where: { id: "p1" }, create: { a: 1 }, update: {} }, T);
    expect(out.where).toEqual({ id: "p1", tenant_id: T });
    expect(out.create).toEqual({ a: 1, tenant_id: T });
  });

  it("does not mutate the original args object", () => {
    const args = { where: { active: true } };
    applyTenantScope("findMany", args, T);
    expect(args.where).toEqual({ active: true });
  });

  it("knows the full set of tenant-owned models (26)", () => {
    expect(TENANT_MODELS.size).toBe(26);
    expect(TENANT_MODELS.has("Product")).toBe(true);
    expect(TENANT_MODELS.has("Tenant")).toBe(false);
  });
});
