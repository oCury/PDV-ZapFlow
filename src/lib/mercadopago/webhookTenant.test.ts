import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  basePrisma: { mpConnection: { findFirst: vi.fn() } },
}));

import { basePrisma } from "@/lib/prisma";
import { resolveTenantFromUserId } from "./webhookTenant";

const findFirst = basePrisma.mpConnection.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("resolveTenantFromUserId", () => {
  it("returns the tenant_id mapped from mp_user_id", async () => {
    findFirst.mockResolvedValue({ tenant_id: "t1" });
    expect(await resolveTenantFromUserId("555")).toBe("t1");
    expect(findFirst).toHaveBeenCalledWith({ where: { mp_user_id: "555" } });
  });

  it("returns null when no connection matches", async () => {
    findFirst.mockResolvedValue(null);
    expect(await resolveTenantFromUserId("999")).toBeNull();
  });

  it("returns null for an empty user id", async () => {
    expect(await resolveTenantFromUserId("")).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
