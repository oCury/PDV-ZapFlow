import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "./secretBox";

// 32-byte key as 64 hex chars
const KEY = "0".repeat(64);

beforeEach(() => {
  process.env.MP_TOKEN_ENC_KEY = KEY;
});

afterEach(() => {
  delete process.env.MP_TOKEN_ENC_KEY;
});

describe("secretBox", () => {
  it("round-trips plaintext", () => {
    const ct = encryptSecret("APP_USR-super-secret");
    expect(ct).not.toContain("super-secret");
    expect(ct.startsWith("v1:")).toBe(true);
    expect(decryptSecret(ct)).toBe("APP_USR-super-secret");
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("rejects a tampered ciphertext", () => {
    const ct = encryptSecret("hello");
    const parts = ct.split(":");
    parts[3] = parts[3].replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("throws on a malformed key", () => {
    process.env.MP_TOKEN_ENC_KEY = "not-hex";
    expect(() => encryptSecret("x")).toThrow(/MP_TOKEN_ENC_KEY/);
  });

  it("rejects an envelope with extra segments", () => {
    const ct = encryptSecret("hello");
    expect(() => decryptSecret(ct + ":extra")).toThrow(/Malformed secret envelope/);
  });
});
