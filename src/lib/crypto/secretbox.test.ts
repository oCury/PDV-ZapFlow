import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.CREDENTIALS_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
});

import { encryptJson, decryptJson } from "./secretbox";

describe("secretbox", () => {
  it("round-trips an object", () => {
    const blob = encryptJson({ accessToken: "tok_123", n: 3 });
    expect(blob).not.toContain("tok_123");
    expect(decryptJson<{ accessToken: string; n: number }>(blob)).toEqual({ accessToken: "tok_123", n: 3 });
  });
  it("produces a fresh IV each call (ciphertext differs)", () => {
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
  });
  it("throws on a tampered blob", () => {
    const blob = encryptJson({ a: 1 });
    const [iv, tag, data] = blob.split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptJson(`${iv}.${tag}.${flipped.toString("base64")}`)).toThrow();
  });
});
