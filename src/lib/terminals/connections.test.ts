import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { providerConnection: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeAll(() => { process.env.CREDENTIALS_ENC_KEY = Buffer.alloc(32, 7).toString("base64"); });
beforeEach(() => vi.clearAllMocks());

import { encryptJson } from "@/lib/crypto/secretbox";
import { loadConnection } from "./connections";

describe("loadConnection", () => {
  it("returns the connection with decrypted credentials", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue({
      id: "pc_1", provider: "mercadopago", mode: "live", status: "live",
      external_account_id: "u_9", credentials: encryptJson({ accessToken: "tok" }),
    });
    const res = await loadConnection("mercadopago");
    expect(res?.credentials).toEqual({ accessToken: "tok" });
    expect(res?.mode).toBe("live");
  });
  it("returns null when no connection exists", async () => {
    prismaMock.providerConnection.findFirst.mockResolvedValue(null);
    expect(await loadConnection("stone")).toBeNull();
  });
});
