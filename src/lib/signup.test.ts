import { describe, it, expect } from "vitest";
import { slugify, validateSignup } from "./signup";

describe("slugify", () => {
  it("lowercases, strips accents/symbols, hyphenates", () => {
    expect(slugify("Loja do João & Cia!")).toBe("loja-do-joao-cia");
  });
  it("collapses and trims hyphens", () => {
    expect(slugify("  --A  B--  ")).toBe("a-b");
  });
  it("falls back to 'loja' when empty after sanitisation", () => {
    expect(slugify("!!!")).toBe("loja");
  });
});

describe("validateSignup", () => {
  const ok = { loja: "Loja X", name: "Ana", email: "a@b.com", password: "secret12", plan: "pro", website: "" };
  it("accepts a valid payload", () => {
    expect(validateSignup(ok)).toEqual({ ok: true });
  });
  it("rejects honeypot filled", () => {
    expect(validateSignup({ ...ok, website: "bot" })).toEqual({ ok: false, error: "Cadastro inválido." });
  });
  it("rejects short password", () => {
    expect(validateSignup({ ...ok, password: "short" }).ok).toBe(false);
  });
  it("rejects bad email", () => {
    expect(validateSignup({ ...ok, email: "nope" }).ok).toBe(false);
  });
  it("rejects unknown plan", () => {
    expect(validateSignup({ ...ok, plan: "enterprise" }).ok).toBe(false);
  });
  it("rejects missing loja/name", () => {
    expect(validateSignup({ ...ok, loja: "" }).ok).toBe(false);
  });
});

