process.env.SESSION_SECRET ||= "test-secret";

import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret";
});

describe("session token carries tenantId", () => {
  it("round-trips tenantId through create/parse", async () => {
    const { createSessionToken, parseSessionToken } = await import("./auth");
    const token = createSessionToken({ userId: "u1", role: "ADMIN", name: "A", tenantId: "t1" });
    expect(parseSessionToken(token)).toMatchObject({ userId: "u1", tenantId: "t1" });
  });

  it("rejects a tampered token", async () => {
    const { createSessionToken, parseSessionToken } = await import("./auth");
    const token = createSessionToken({ userId: "u1", role: "ADMIN", name: "A", tenantId: "t1" });
    expect(parseSessionToken(token + "x")).toBeNull();
  });
});
