import { describe, it, expect } from "vitest";
import { resolveDriver } from "./registry";

describe("resolveDriver", () => {
  it("returns the real MP driver in live mode", () => {
    const d = resolveDriver({ provider: "mercadopago", mode: "live" } as any);
    expect(d.name).toBe("mercadopago");
    expect(d.capabilities.deviceSync).toBe(true);
  });
  it("returns a sandbox driver in sandbox mode", () => {
    const d = resolveDriver({ provider: "stone", mode: "sandbox" } as any);
    expect(d.name).toBe("stone");
    expect(d.capabilities.deviceSync).toBe(false); // sandbox capability profile
  });
});
