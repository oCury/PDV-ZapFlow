import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mercadopago/oauthState", () => ({ verifyState: vi.fn() }));
vi.mock("@/lib/mercadopago/oauth", () => ({ exchangeCodeForTokens: vi.fn() }));
vi.mock("@/lib/mercadopago/connection", () => ({ saveConnection: vi.fn() }));

import { GET } from "./route";
import { verifyState } from "@/lib/mercadopago/oauthState";
import { exchangeCodeForTokens } from "@/lib/mercadopago/oauth";
import { saveConnection } from "@/lib/mercadopago/connection";

const verifyMock = verifyState as unknown as ReturnType<typeof vi.fn>;
const exchangeMock = exchangeCodeForTokens as unknown as ReturnType<typeof vi.fn>;
const saveMock = saveConnection as unknown as ReturnType<typeof vi.fn>;

function req(url: string, pkce = "VER") {
  return new Request(url, { headers: { cookie: `mp_pkce=${pkce}` } });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/mp/oauth/callback", () => {
  it("exchanges the code and saves the connection, then redirects to settings (success)", async () => {
    verifyMock.mockReturnValue({ tenantId: "t1" });
    exchangeMock.mockResolvedValue({ accessToken: "AT", refreshToken: "RT", mpUserId: "555", expiresInSeconds: 100, liveMode: true });
    const res = await GET(req("https://app.example.com/api/mp/oauth/callback?code=CODE&state=STATE"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/settings/terminals?mp=connected");
    expect(exchangeMock).toHaveBeenCalledWith({ code: "CODE", codeVerifier: "VER" });
    expect(saveMock).toHaveBeenCalledWith("t1", expect.objectContaining({ accessToken: "AT" }));
  });

  it("redirects with an error when MP returns error=access_denied", async () => {
    const res = await GET(req("https://app.example.com/api/mp/oauth/callback?error=access_denied"));
    expect(res.headers.get("location")).toContain("/settings/terminals?mp=error");
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("redirects with an error when state verification fails", async () => {
    verifyMock.mockImplementation(() => { throw new Error("Invalid state signature"); });
    const res = await GET(req("https://app.example.com/api/mp/oauth/callback?code=CODE&state=BAD"));
    expect(res.headers.get("location")).toContain("/settings/terminals?mp=error");
    expect(saveMock).not.toHaveBeenCalled();
  });
});
