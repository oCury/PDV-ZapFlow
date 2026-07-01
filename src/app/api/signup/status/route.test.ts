import { it, expect, vi, beforeEach } from "vitest";

const pendingFindUnique = vi.fn();
const pendingUpdate = vi.fn();
const tenantFindUnique = vi.fn();
const setSessionCookieMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  basePrisma: {
    pendingSignup: {
      findUnique: (a: unknown) => pendingFindUnique(a),
      update: (a: unknown) => pendingUpdate(a),
    },
    tenant: {
      findUnique: (a: unknown) => tenantFindUnique(a),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  setSessionCookie: (a: unknown) => setSessionCookieMock(a),
  getSession: () => getSessionMock(),
}));

import { GET } from "./route";

function req(order?: string) {
  const url = order
    ? `http://x/api/signup/status?order=${encodeURIComponent(order)}`
    : "http://x/api/signup/status";
  return new Request(url) as never;
}

beforeEach(() => {
  pendingFindUnique.mockReset();
  pendingUpdate.mockReset();
  tenantFindUnique.mockReset();
  setSessionCookieMock.mockReset();
  getSessionMock.mockReset();
});

it("no order → 400 {status:unknown}", async () => {
  const res = await GET(req());
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.status).toBe("unknown");
});

it("unknown order → {status:unknown}", async () => {
  pendingFindUnique.mockResolvedValue(null);
  const res = await GET(req("o999"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("unknown");
  expect(setSessionCookieMock).not.toHaveBeenCalled();
});

it("pending → {status:pending}, no cookie set", async () => {
  pendingFindUnique.mockResolvedValue({
    order_nsu: "o1",
    status: "pending",
    created_user_id: null,
    created_tenant_id: null,
    name: "Ana",
  });
  const res = await GET(req("o1"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("pending");
  expect(setSessionCookieMock).not.toHaveBeenCalled();
});

it("new-signup PAID → setSessionCookie called once, pending marked consumed, {status:ready}", async () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  pendingFindUnique.mockResolvedValue({
    order_nsu: "o1",
    status: "paid",
    created_user_id: "u1",
    created_tenant_id: "t1",
    name: "Ana",
  });
  tenantFindUnique.mockResolvedValue({ paid_until: futureDate });
  setSessionCookieMock.mockResolvedValue(undefined);
  pendingUpdate.mockResolvedValue({});

  const res = await GET(req("o1"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ready");

  expect(setSessionCookieMock).toHaveBeenCalledTimes(1);
  expect(setSessionCookieMock).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "u1",
      role: "ADMIN",
      name: "Ana",
      tenantId: "t1",
      paidUntil: futureDate.toISOString(),
    })
  );
  expect(pendingUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { order_nsu: "o1" },
      data: { status: "consumed" },
    })
  );
});

it("new-signup CONSUMED → setSessionCookie NOT called (single-use), {status:ready}", async () => {
  pendingFindUnique.mockResolvedValue({
    order_nsu: "o1",
    status: "consumed",
    created_user_id: "u1",
    created_tenant_id: "t1",
    name: "Ana",
  });

  const res = await GET(req("o1"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ready");
  expect(setSessionCookieMock).not.toHaveBeenCalled();
  expect(pendingUpdate).not.toHaveBeenCalled();
});

it("renewal with matching session → setSessionCookie called with refreshed paidUntil, {status:ready}", async () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  pendingFindUnique.mockResolvedValue({
    order_nsu: "o2",
    status: "paid",
    created_user_id: null,
    created_tenant_id: "t1",
    name: "Ana",
  });
  getSessionMock.mockResolvedValue({
    userId: "u1",
    role: "ADMIN",
    name: "Ana",
    tenantId: "t1",
    paidUntil: "2026-01-01T00:00:00.000Z",
  });
  tenantFindUnique.mockResolvedValue({ paid_until: futureDate });
  setSessionCookieMock.mockResolvedValue(undefined);

  const res = await GET(req("o2"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ready");

  expect(setSessionCookieMock).toHaveBeenCalledTimes(1);
  expect(setSessionCookieMock).toHaveBeenCalledWith({
    userId: "u1",
    role: "ADMIN",
    name: "Ana",
    tenantId: "t1",
    paidUntil: futureDate.toISOString(),
  });
});

it("renewal without session → setSessionCookie NOT called, {status:ready}", async () => {
  pendingFindUnique.mockResolvedValue({
    order_nsu: "o2",
    status: "paid",
    created_user_id: null,
    created_tenant_id: "t1",
    name: "Ana",
  });
  getSessionMock.mockResolvedValue(null);

  const res = await GET(req("o2"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ready");
  expect(setSessionCookieMock).not.toHaveBeenCalled();
});
