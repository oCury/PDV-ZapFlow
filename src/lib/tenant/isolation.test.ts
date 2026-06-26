import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runWithTenant, getTenantId } from "./context";
import { applyTenantScope, TENANT_MODELS } from "./scope";

// Mirror the extension wiring from src/lib/prisma.ts, capturing the args the
// engine WOULD receive. query() is never called, so no DB connection opens.
function makeProbe() {
  const calls: { model?: string; operation: string; args: unknown }[] = [];
  const client = new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          if (!model || !TENANT_MODELS.has(model)) {
            calls.push({ model, operation, args });
            return [] as unknown;
          }
          const scoped = applyTenantScope(operation, (args ?? {}) as Record<string, unknown>, getTenantId());
          calls.push({ model, operation, args: scoped });
          return [] as unknown;
        },
      },
    },
  });
  return { client, calls, last: () => calls.at(-1)! };
}

describe("cross-tenant isolation (extension enforces tenant_id)", () => {
  let probe: ReturnType<typeof makeProbe>;
  beforeEach(() => { probe = makeProbe(); });

  it("findMany on Product is scoped to the caller's tenant", async () => {
    await runWithTenant("tenantA", async () => await probe.client.product.findMany({ where: { name: "x" } }));
    expect((probe.last().args as { where: unknown }).where).toEqual({ name: "x", tenant_id: "tenantA" });
  });

  it("update on Sale is scoped (cannot touch another tenant's row)", async () => {
    await runWithTenant("tenantA", async () =>
      await probe.client.sale.update({ where: { id: "s_from_B" } as never, data: { notes: "z" } as never }));
    expect((probe.last().args as { where: unknown }).where).toEqual({ id: "s_from_B", tenant_id: "tenantA" });
  });

  it("delete on Customer is scoped", async () => {
    await runWithTenant("tenantA", async () => await probe.client.customer.delete({ where: { id: "c_B" } as never }));
    expect((probe.last().args as { where: unknown }).where).toEqual({ id: "c_B", tenant_id: "tenantA" });
  });

  it("create on Voucher stamps the tenant", async () => {
    await runWithTenant("tenantA", async () =>
      await probe.client.voucher.create({ data: { code: "V1" } as never }));
    expect((probe.last().args as { data: unknown }).data).toMatchObject({ tenant_id: "tenantA" });
  });

  it("a scoped query with NO tenant context throws (fail-closed)", async () => {
    await expect(probe.client.storeSettings.findMany()).rejects.toThrow(/No tenant context/);
  });
});
