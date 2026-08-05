import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mercadopago/checkout", () => ({
  validateWebhookSignature: vi.fn(() => true),
  getPayment: vi.fn(),
}));
vi.mock("@/lib/terminals/service", () => ({
  handleWebhook: vi.fn(async () => ({ received: true })),
}));

import { POST } from "./route";
import { handleWebhook } from "@/lib/terminals/service";

const handleWebhookMock = handleWebhook as unknown as ReturnType<typeof vi.fn>;

function orderReq() {
  return new Request("http://x/api/webhooks/mercadopago", {
    method: "POST",
    headers: { "x-signature": "ts=1,v1=abc", "x-request-id": "r1" },
    body: JSON.stringify({ type: "order", data: { id: "ord_1" } }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("webhook orders topic", () => {
  it("delegates to handleWebhook and returns 200 for an order event", async () => {
    const res = await POST(orderReq());
    expect(res.status).toBe(200);
    expect(handleWebhookMock).toHaveBeenCalledWith(
      "mercadopago",
      expect.any(Object),
      expect.stringContaining("ord_1"),
    );
  });
});
