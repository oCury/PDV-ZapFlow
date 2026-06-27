import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mercadopago/webhookTenant", () => ({
  resolveTenantFromUserId: vi.fn(async () => "t1"),
}));
vi.mock("@/lib/mercadopago/connection", () => ({
  resolveMpAccessToken: vi.fn(async () => "TOK"),
}));
vi.mock("@/lib/tenant/context", () => ({
  runWithTenant: vi.fn((_tenantId: string, fn: () => unknown) => fn()),
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
import { resolveTenantFromUserId } from "@/lib/mercadopago/webhookTenant";
import { resolveMpAccessToken } from "@/lib/mercadopago/connection";
import { runWithTenant } from "@/lib/tenant/context";

const finalizeMock = finalizeCharge as unknown as ReturnType<typeof vi.fn>;
const resolveTenantMock = resolveTenantFromUserId as unknown as ReturnType<typeof vi.fn>;
const resolveTokenMock = resolveMpAccessToken as unknown as ReturnType<typeof vi.fn>;
const runWithTenantMock = runWithTenant as unknown as ReturnType<typeof vi.fn>;

function orderReq() {
  return new Request("http://x/api/webhooks/mercadopago", {
    method: "POST",
    headers: { "x-signature": "ts=1,v1=abc", "x-request-id": "r1" },
    body: JSON.stringify({ type: "order", user_id: "555", data: { id: "ord_1" } }),
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

  it("resolves tenant from body.user_id and runs inside runWithTenant", async () => {
    await POST(orderReq());
    expect(resolveTenantMock).toHaveBeenCalledWith("555");
    expect(runWithTenantMock).toHaveBeenCalledWith("t1", expect.any(Function));
    expect(resolveTokenMock).toHaveBeenCalledWith("t1");
  });

  it("ignores the event when no tenant is found and fallback is empty", async () => {
    resolveTenantMock.mockResolvedValueOnce(null);
    const req = new Request("http://x/api/webhooks/mercadopago", {
      method: "POST",
      headers: { "x-signature": "ts=1,v1=abc", "x-request-id": "r1" },
      body: JSON.stringify({ type: "order", user_id: "unknown", data: { id: "ord_1" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ received: true, ignored: "no_tenant" });
    expect(finalizeMock).not.toHaveBeenCalled();
  });
});
