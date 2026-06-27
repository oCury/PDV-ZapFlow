import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireTenant: vi.fn() }));
vi.mock("@/lib/mercadopago/connection", () => ({ getConnectionStatus: vi.fn(), deleteConnection: vi.fn() }));

import { GET, DELETE } from "./route";
import { requireTenant } from "@/lib/auth";
import { getConnectionStatus, deleteConnection } from "@/lib/mercadopago/connection";

const requireTenantMock = requireTenant as unknown as ReturnType<typeof vi.fn>;
const statusMock = getConnectionStatus as unknown as ReturnType<typeof vi.fn>;
const deleteMock = deleteConnection as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/mp/connection", () => {
  it("401 when unauthenticated", async () => {
    requireTenantMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it("returns the connection status for the tenant", async () => {
    requireTenantMock.mockResolvedValue({ tenantId: "t1" });
    statusMock.mockResolvedValue({ connected: true, mpUserId: "555", liveMode: true });
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: true, mpUserId: "555", liveMode: true });
    expect(statusMock).toHaveBeenCalledWith("t1");
  });
});

describe("DELETE /api/mp/connection", () => {
  it("disconnects the tenant", async () => {
    requireTenantMock.mockResolvedValue({ tenantId: "t1" });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("t1");
  });
});
