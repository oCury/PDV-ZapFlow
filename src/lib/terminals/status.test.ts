import { describe, it, expect } from "vitest";
import { normalizeChargeStatus } from "./status";

describe("normalizeChargeStatus", () => {
  it("maps approval words to APPROVED", () => {
    for (const w of ["approved", "processed", "paid", "PAID"]) expect(normalizeChargeStatus(w)).toBe("APPROVED");
  });
  it("maps in-flight words to PROCESSING", () => {
    for (const w of ["pending", "processing", "in_process"]) expect(normalizeChargeStatus(w)).toBe("PROCESSING");
  });
  it("maps cancel words to CANCELED", () => {
    expect(normalizeChargeStatus("cancelled")).toBe("CANCELED");
    expect(normalizeChargeStatus("canceled")).toBe("CANCELED");
  });
  it("defaults unknown/failure to DECLINED", () => {
    expect(normalizeChargeStatus("rejected")).toBe("DECLINED");
    expect(normalizeChargeStatus("whatever")).toBe("DECLINED");
  });
});
