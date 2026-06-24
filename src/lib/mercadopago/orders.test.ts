import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return { ...actual, mpFetch: vi.fn() };
});

import { mpFetch } from "./client";
import { createTerminalOrder, getOrder, cancelOrder } from "./orders";

const mpFetchMock = mpFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => mpFetchMock.mockReset());

describe("createTerminalOrder", () => {
  it("POSTs a point order with the device terminal_id, decimal amount and installments", async () => {
    mpFetchMock.mockResolvedValue({ id: "ord_1" });
    const res = await createTerminalOrder({
      terminalDeviceId: "DEV123",
      amount: 99.9,
      method: "CREDIT",
      installments: 3,
      externalRef: "chg_1",
    });
    expect(res.id).toBe("ord_1");
    const [path, init] = mpFetchMock.mock.calls[0];
    expect(path).toBe("/v1/orders");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("point");
    expect(body.external_reference).toBe("chg_1");
    expect(body.total_amount).toBe("99.90");
    expect(body.config.point.terminal_id).toBe("DEV123");
    expect(body.transactions.payments[0].payment_method.type).toBe("credit_card");
    expect(body.transactions.payments[0].payment_method.installments).toBe(3);
    expect(init.idempotencyKey).toBe("chg_1");
  });
});

describe("getOrder / cancelOrder", () => {
  it("GETs the order by id", async () => {
    mpFetchMock.mockResolvedValue({ id: "ord_1", status: "processed" });
    const o = await getOrder("ord_1");
    expect(o.status).toBe("processed");
    expect(mpFetchMock.mock.calls[0][0]).toBe("/v1/orders/ord_1");
  });
  it("cancels the order by id", async () => {
    mpFetchMock.mockResolvedValue({ id: "ord_1", status: "canceled" });
    await cancelOrder("ord_1");
    expect(mpFetchMock.mock.calls[0][0]).toBe("/v1/orders/ord_1/cancel");
  });
});
