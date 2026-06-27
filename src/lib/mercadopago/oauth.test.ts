import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { buildAuthorizeUrl, createPkcePair, exchangeCodeForTokens, refreshTokens } from "./oauth";

beforeEach(() => {
  process.env.MP_OAUTH_CLIENT_ID = "app-123";
  process.env.MP_OAUTH_CLIENT_SECRET = "secret-xyz";
  process.env.MP_OAUTH_REDIRECT_URI = "https://app.example.com/api/mp/oauth/callback";
});
afterEach(() => vi.restoreAllMocks());

describe("buildAuthorizeUrl", () => {
  it("includes client_id, redirect_uri, state, and S256 PKCE challenge", () => {
    const url = new URL(buildAuthorizeUrl({ state: "STATE", codeChallenge: "CHALLENGE" }));
    expect(url.origin + url.pathname).toBe("https://auth.mercadopago.com/authorization");
    expect(url.searchParams.get("client_id")).toBe("app-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("platform_id")).toBe("mp");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/mp/oauth/callback");
    expect(url.searchParams.get("state")).toBe("STATE");
    expect(url.searchParams.get("code_challenge")).toBe("CHALLENGE");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("createPkcePair", () => {
  it("produces a verifier and a matching S256 challenge", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toBe(verifier);
  });
});

describe("exchangeCodeForTokens", () => {
  it("POSTs authorization_code and maps the response", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "AT", refresh_token: "RT", user_id: 555,
          expires_in: 15552000, public_key: "PK", scope: "read write offline_access",
          token_type: "bearer", live_mode: true,
        }),
        { status: 200 }
      )
    );
    const res = await exchangeCodeForTokens({ code: "CODE", codeVerifier: "VER" });
    expect(res.accessToken).toBe("AT");
    expect(res.refreshToken).toBe("RT");
    expect(res.mpUserId).toBe("555");
    expect(res.expiresInSeconds).toBe(15552000);
    expect(res.liveMode).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.mercadopago.com/oauth/token");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.grant_type).toBe("authorization_code");
    expect(body.client_id).toBe("app-123");
    expect(body.client_secret).toBe("secret-xyz");
    expect(body.code).toBe("CODE");
    expect(body.code_verifier).toBe("VER");
  });

  it("throws on a non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 400 }));
    await expect(exchangeCodeForTokens({ code: "x", codeVerifier: "y" })).rejects.toThrow();
  });
});

describe("refreshTokens", () => {
  it("POSTs refresh_token grant", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "AT2", refresh_token: "RT2", user_id: 555, expires_in: 100 }),
        { status: 200 }
      )
    );
    const res = await refreshTokens({ refreshToken: "RT" });
    expect(res.accessToken).toBe("AT2");
    expect(res.refreshToken).toBe("RT2");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.grant_type).toBe("refresh_token");
    expect(body.refresh_token).toBe("RT");
  });
});
