import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const provision = vi.fn();

vi.mock("@/lib/prisma", () => ({
  basePrisma: {
    pendingSignup: {
      findUnique: (a: unknown) => findUnique(a),
      update: (a: unknown) => update(a),
    },
    tenant: { findUnique: vi.fn(), update: vi.fn() },
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
