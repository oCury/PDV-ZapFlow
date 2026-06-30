import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to N then blocks within the window", () => {
    const key = "ip-1:test";
    let allowed = 0;
    for (let i = 0; i < 7; i++) if (rateLimit(key, 5, 60_000)) allowed++;
    expect(allowed).toBe(5);
  });
});
