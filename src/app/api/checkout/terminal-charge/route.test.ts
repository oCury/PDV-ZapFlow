import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/terminals/service", () => ({ initiateCharge: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => ({ userId: "u1", tenantId: "t1" })) }));

import { POST } from "./route";
import { initiateCharge } from "@/lib/terminals/service";

const initiateMock = initiateCharge as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://x/api/checkout/terminal-charge", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const base = {
  terminalId: "t1",
  method: "CREDIT",
  installments: 3,
  totalAmount: 90,
  items: [{ productId: "p1", quantity: 1, unitPrice: 90 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  initiateMock.mockResolvedValue({ ok: true, data: { chargeId: "chg_1", status: "SENT" } });
});

describe("POST terminal-charge", () => {
  it("returns 400 for invalid body", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
  it("returns 200 with chargeId+status on success", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ chargeId: "chg_1", status: "SENT" });
  });
  it("returns 409 when service yields DEVICE_BUSY", async () => {
    initiateMock.mockResolvedValue({ ok: false, error: { code: "DEVICE_BUSY", message: "ocupada" } });
    const res = await POST(req(base));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "DEVICE_BUSY" });
  });
  it("returns 400 when service yields CONFIG", async () => {
    initiateMock.mockResolvedValue({ ok: false, error: { code: "CONFIG", message: "cfg" } });
    const res = await POST(req(base));
    expect(res.status).toBe(400);
  });
  it("returns 401 when unauthenticated", async () => {
    const { getSession } = await import("@/lib/auth");
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(req(base));
    expect(res.status).toBe(401);
  });
});
