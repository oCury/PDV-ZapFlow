import { describe, it, expect } from "vitest";
import { toAmountString, methodToMpType, validateInstallments } from "./amount";

describe("toAmountString", () => {
  it("formats reais with two decimals", () => {
    expect(toAmountString(12.3)).toBe("12.30");
    expect(toAmountString(1)).toBe("1.00");
    expect(toAmountString(199.999)).toBe("200.00");
  });
});

describe("methodToMpType", () => {
  it("maps charge methods to MP payment-method types", () => {
    expect(methodToMpType("CREDIT")).toBe("credit_card");
    expect(methodToMpType("DEBIT")).toBe("debit_card");
    expect(methodToMpType("PIX")).toBe("pix");
  });
});

describe("validateInstallments", () => {
  it("accepts 1 installment for any amount", () => {
    expect(validateInstallments(10, 1, 12)).toEqual({ ok: true });
  });
  it("rejects installments above the store max", () => {
    expect(validateInstallments(100, 7, 6)).toEqual({
      ok: false,
      reason: "MAX_EXCEEDED",
    });
  });
  it("rejects when a parcela would fall below R$5,00", () => {
    expect(validateInstallments(12, 3, 6)).toEqual({
      ok: false,
      reason: "MIN_PARCELA",
    });
  });
  it("accepts when each parcela is at least R$5,00", () => {
    expect(validateInstallments(15, 3, 6)).toEqual({ ok: true });
  });
});
