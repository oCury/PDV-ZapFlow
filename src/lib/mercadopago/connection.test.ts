import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  basePrisma: {
    mpConnection: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("./oauth", () => ({ refreshTokens: vi.fn() }));
vi.mock("@/lib/crypto/secretBox", () => ({
  encryptSecret: (s: string) => `enc(${s})`,
  decryptSecret: (s: string) => s.replace(/^enc\((.*)\)$/, "$1"),
}));

import { basePrisma } from "@/lib/prisma";
import { refreshTokens } from "./oauth";
import {
  resolveMpAccessToken,
  saveConnection,
  MpNotConnectedError,
} from "./connection";

const findUnique = basePrisma.mpConnection.findUnique as unknown as ReturnType<typeof vi.fn>;
const update = basePrisma.mpConnection.update as unknown as ReturnType<typeof vi.fn>;
const upsert = basePrisma.mpConnection.upsert as unknown as ReturnType<typeof vi.fn>;
const refreshMock = refreshTokens as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
});

describe("resolveMpAccessToken", () => {
  it("falls back to the env token when the tenant has no connection", async () => {
    findUnique.mockResolvedValue(null);
    process.env.MERCADOPAGO_ACCESS_TOKEN = "ENV_TOKEN";
    expect(await resolveMpAccessToken("t1")).toBe("ENV_TOKEN");
  });

  it("throws MpNotConnectedError when unconnected and no env fallback", async () => {
    findUnique.mockResolvedValue(null);
    await expect(resolveMpAccessToken("t1")).rejects.toBeInstanceOf(MpNotConnectedError);
  });

  it("returns the decrypted token when it is not near expiry", async () => {
    findUnique.mockResolvedValue({
      tenant_id: "t1",
      access_token: "enc(LIVE_AT)",
      refresh_token: "enc(RT)",
      access_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 72), // 72h out
    });
    expect(await resolveMpAccessToken("t1")).toBe("LIVE_AT");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes and persists the rotated tokens when near expiry", async () => {
    findUnique.mockResolvedValue({
      tenant_id: "t1",
      access_token: "enc(OLD_AT)",
      refresh_token: "enc(OLD_RT)",
      access_token_expires_at: new Date(Date.now() + 1000 * 60), // 1 min out → refresh
    });
    refreshMock.mockResolvedValue({
      accessToken: "NEW_AT", refreshToken: "NEW_RT", mpUserId: "555",
      expiresInSeconds: 15552000, liveMode: true,
    });
    update.mockResolvedValue({});
    expect(await resolveMpAccessToken("t1")).toBe("NEW_AT");
    expect(refreshMock).toHaveBeenCalledWith({ refreshToken: "OLD_RT" });
    const data = update.mock.calls[0][0].data;
    expect(data.access_token).toBe("enc(NEW_AT)");
    expect(data.refresh_token).toBe("enc(NEW_RT)");
  });
});

describe("resolveMpAccessToken — refresh failure", () => {
  const nearExpiryConn = {
    tenant_id: "t1",
    access_token: "enc(OLD_AT)",
    refresh_token: "enc(OLD_RT)",
    access_token_expires_at: new Date(Date.now() + 1000 * 60), // 1 min out → near expiry
  };

  it("throws MpNotConnectedError when refresh fails and the connection is still stale", async () => {
    findUnique
      .mockResolvedValueOnce(nearExpiryConn)
      .mockResolvedValueOnce(nearExpiryConn); // re-read also stale
    refreshMock.mockRejectedValue(new Error("MP OAuth token 401: bad_token"));
    await expect(resolveMpAccessToken("t1")).rejects.toBeInstanceOf(MpNotConnectedError);
  });

  it("returns the concurrently-refreshed token when refresh fails but a re-read shows a fresh token", async () => {
    const freshConn = {
      tenant_id: "t1",
      access_token: "enc(FRESH_AT)",
      refresh_token: "enc(FRESH_RT)",
      access_token_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 72), // 72h out
    };
    findUnique
      .mockResolvedValueOnce(nearExpiryConn)
      .mockResolvedValueOnce(freshConn); // concurrent refresh already rotated the token
    refreshMock.mockRejectedValue(new Error("MP OAuth token 400: invalid_grant"));
    expect(await resolveMpAccessToken("t1")).toBe("FRESH_AT");
  });
});

describe("saveConnection", () => {
  it("upserts an encrypted connection for the tenant", async () => {
    upsert.mockResolvedValue({});
    await saveConnection("t1", {
      accessToken: "AT", refreshToken: "RT", mpUserId: "555",
      expiresInSeconds: 15552000, publicKey: "PK", scope: "read", tokenType: "bearer", liveMode: true,
    });
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ tenant_id: "t1" });
    expect(args.create.access_token).toBe("enc(AT)");
    expect(args.create.refresh_token).toBe("enc(RT)");
    expect(args.create.mp_user_id).toBe("555");
  });
});
