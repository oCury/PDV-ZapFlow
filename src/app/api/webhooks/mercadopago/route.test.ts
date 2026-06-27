import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mercadopago/client", () => ({
  getAccessToken: vi.fn(() => "TEST_TOKEN"),
}));
vi.mock("@/lib/mercadopago", () => ({
  validateWebhookSignature: vi.fn(() => true),
  getPayment: vi.fn(),
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

const finalizeMock = finalizeCharge as unknown as ReturnType<typeof vi.fn>;

function orderReq() {
  return new Request("http://x/api/webhooks/mercadopago", {
    method: "POST",
    headers: { "x-signature": "ts=1,v1=abc", "x-request-id": "r1" },
    body: JSON.stringify({ type: "order", data: { id: "ord_1" } }),
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
});
