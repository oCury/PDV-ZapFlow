import { describe, it, expect, vi, afterEach } from "vitest";
import { validateWebhookSignature } from "./checkout";

describe("validateWebhookSignature — no secret configured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false in production when no secret is set (rejects forged webhooks)", () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(validateWebhookSignature("ts=1,v1=x", "r", "id")).toBe(false);
  });

  it("returns true in test when no secret is set (frictionless local work)", () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(validateWebhookSignature("ts=1,v1=x", "r", "id")).toBe(true);
  });
});
