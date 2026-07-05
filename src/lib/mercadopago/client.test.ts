import { describe, it, expect, vi, beforeEach } from "vitest";
import { mpFetch } from "./client";

describe("mpFetch token", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("uses an explicit accessToken over the env token", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await mpFetch("/v1/orders/x", { accessToken: "tok_explicit" });
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok_explicit");
  });
});
