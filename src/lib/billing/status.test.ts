import { it, expect } from "vitest";
import { subscriptionStatus } from "./status";
const now = new Date("2026-07-01T12:00:00Z");
it("null paid_until => active (grandfathered)", () => {
  expect(subscriptionStatus(null, now)).toEqual({ state: "active", daysLeft: null });
});
it("future => active with daysLeft", () => {
  expect(subscriptionStatus(new Date("2026-07-04T12:00:00Z"), now)).toEqual({ state: "active", daysLeft: 3 });
});
it("past => lapsed", () => {
  expect(subscriptionStatus(new Date("2026-06-30T12:00:00Z"), now)).toEqual({ state: "lapsed", daysLeft: 0 });
});
