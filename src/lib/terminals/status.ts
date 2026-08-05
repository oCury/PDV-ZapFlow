import type { TerminalChargeStatus } from "@prisma/client";

const APPROVED = new Set(["approved", "processed", "paid", "authorized"]);
const PROCESSING = new Set(["pending", "processing", "in_process", "sent", "created"]);
const CANCELED = new Set(["canceled", "cancelled", "refunded", "voided"]);

/** Normalizes a provider's raw status string into our TerminalChargeStatus enum. */
export function normalizeChargeStatus(raw: string): TerminalChargeStatus {
  const s = raw.trim().toLowerCase();
  if (APPROVED.has(s)) return "APPROVED";
  if (CANCELED.has(s)) return "CANCELED";
  if (PROCESSING.has(s)) return "PROCESSING";
  return "DECLINED";
}
