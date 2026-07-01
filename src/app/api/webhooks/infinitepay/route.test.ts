import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const provision = vi.fn();
const tenantFindUnique = vi.fn();
const tenantUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  basePrisma: {
    pendingSignup: {
      findUnique: (a: unknown) => findUnique(a),
      update: (a: unknown) => update(a),
    },
    tenant: {
      findUnique: (a: unknown) => tenantFindUnique(a),
      update: (a: unknown) => tenantUpdate(a),
    },
  },
}));

vi.mock("@/lib/tenant/provision", () => ({
  createTenantWithAdmin: (a: unknown) => provision(a),
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/webhooks/infinitepay", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  provision.mockReset();
  tenantFindUnique.mockReset();
  tenantUpdate.mockReset();
});

it("creates the account once for a valid paid webhook", async () => {
  findUnique.mockResolvedValue({
    id: "p1",
    order_nsu: "o1",
    status: "pending",
    amount_cents: 16900,
    plan: "pro",
    loja: "Loja",
    name: "Ana",
    email: "a@b.com",
    password_hash: "h",
    created_tenant_id: null,
  });
  provision.mockResolvedValue({ tenantId: "t1", slug: "loja", userId: "u1" });
  const res = await POST(req({ order_nsu: "o1", paid_amount: 16900 }));
  expect(res.status).toBe(200);
  expect(provision).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { order_nsu: "o1" },
      data: expect.objectContaining({
        status: "paid",
        created_tenant_id: "t1",
        created_user_id: "u1",
      }),
    })
  );
});

it("is a no-op when already paid (idempotent)", async () => {
  findUnique.mockResolvedValue({
    id: "p1",
    order_nsu: "o1",
    status: "paid",
    amount_cents: 16900,
  });
  const res = await POST(req({ order_nsu: "o1", paid_amount: 16900 }));
  expect(res.status).toBe(200);
  expect(provision).not.toHaveBeenCalled();
});

it("rejects an unknown order", async () => {
  findUnique.mockResolvedValue(null);
  const res = await POST(req({ order_nsu: "nope", paid_amount: 1 }));
  expect(res.status).toBe(200);
  expect(provision).not.toHaveBeenCalled();
});

it("rejects an amount mismatch", async () => {
  findUnique.mockResolvedValue({
    id: "p1",
    order_nsu: "o1",
    status: "pending",
    amount_cents: 16900,
    plan: "pro",
    loja: "L",
    name: "A",
    email: "a@b.com",
    password_hash: "h",
    created_tenant_id: null,
  });
  const res = await POST(req({ order_nsu: "o1", paid_amount: 100 }));
  expect(res.status).toBe(200);
  expect(provision).not.toHaveBeenCalled();
});

it("returns 200 without throwing if provisioning fails (no retry storm)", async () => {
  findUnique.mockResolvedValue({ id: "p1", order_nsu: "o1", status: "pending", amount_cents: 16900, plan: "pro", loja: "L", name: "A", email: "a@b.com", password_hash: "h", created_tenant_id: null });
  provision.mockRejectedValue(new Error("db down"));
  const res = await POST(req({ order_nsu: "o1", paid_amount: 16900 }));
  expect(res.status).toBe(200);
  expect(provision).toHaveBeenCalledTimes(1);
  expect(update).not.toHaveBeenCalled();
});

it("extends paid_until for a renewal (created_tenant_id set) without provisioning a new account", async () => {
  findUnique.mockResolvedValue({
    id: "p2",
    order_nsu: "o1",
    status: "pending",
    amount_cents: 16900,
    plan: "pro",
    loja: "L",
    name: "A",
    email: "renew+t1@zapflow.internal",
    password_hash: "-",
    created_tenant_id: "t1",
  });
  tenantFindUnique.mockResolvedValue({ paid_until: null });
  tenantUpdate.mockResolvedValue({});
  update.mockResolvedValue({});

  const before = Date.now();
  const res = await POST(req({ order_nsu: "o1", paid_amount: 16900 }));
  const after = Date.now();

  expect(res.status).toBe(200);
  expect(provision).not.toHaveBeenCalled();
  expect(tenantUpdate).toHaveBeenCalledTimes(1);
  const updateCall = tenantUpdate.mock.calls[0][0] as { where: { id: string }; data: { paid_until: Date } };
  expect(updateCall.where).toEqual({ id: "t1" });
  const paidUntil = updateCall.data.paid_until.getTime();
  const PERIOD_MS = 30 * 24 * 60 * 60_000;
  expect(paidUntil).toBeGreaterThanOrEqual(before + PERIOD_MS);
  expect(paidUntil).toBeLessThanOrEqual(after + PERIOD_MS);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ where: { order_nsu: "o1" }, data: { status: "paid" } })
  );
});

it("renewal stacks paid_until on a future date (not from now)", async () => {
  const futureBase = new Date(Date.now() + 10 * 24 * 60 * 60_000); // now + 10 days
  findUnique.mockResolvedValue({
    id: "p3",
    order_nsu: "o2",
    status: "pending",
    amount_cents: 16900,
    plan: "pro",
    loja: "L",
    name: "A",
    email: "renew+t2@zapflow.internal",
    password_hash: "-",
    created_tenant_id: "t2",
  });
  tenantFindUnique.mockResolvedValue({ paid_until: futureBase });
  tenantUpdate.mockResolvedValue({});
  update.mockResolvedValue({});

  const res = await POST(req({ order_nsu: "o2", paid_amount: 16900 }));
  expect(res.status).toBe(200);
  expect(provision).not.toHaveBeenCalled();

  const PERIOD_MS = 30 * 24 * 60 * 60_000;
  const updateCall = tenantUpdate.mock.calls[0][0] as { where: { id: string }; data: { paid_until: Date } };
  expect(updateCall.where).toEqual({ id: "t2" });
  // Must extend from futureBase, not from now
  const result = updateCall.data.paid_until.getTime();
  expect(result).toBeGreaterThanOrEqual(futureBase.getTime() + PERIOD_MS - 1000);
  expect(result).toBeLessThanOrEqual(futureBase.getTime() + PERIOD_MS + 1000);
});
