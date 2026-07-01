import { describe, it, expect } from "vitest";
import { PLAN_PRICE_CENTS, priceForPlan } from "./prices";
describe("plan prices", () => {
  it("matches the landing pricing (centavos)", () => {
    expect(PLAN_PRICE_CENTS.basic).toBe(8900);
    expect(PLAN_PRICE_CENTS.pro).toBe(16900);
  });
  it("priceForPlan returns cents for a valid plan", () => {
    expect(priceForPlan("pro")).toBe(16900);
  });
  it("priceForPlan throws for enterprise (not self-serve)", () => {
    expect(() => priceForPlan("enterprise" as never)).toThrow();
  });
});
