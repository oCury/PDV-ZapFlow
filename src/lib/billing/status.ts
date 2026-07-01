export type AccessState = "active" | "lapsed";

export function subscriptionStatus(
  paidUntil: Date | null,
  now: Date = new Date()
): { state: AccessState; daysLeft: number | null } {
  if (!paidUntil) return { state: "active", daysLeft: null };
  const ms = paidUntil.getTime() - now.getTime();
  if (ms <= 0) return { state: "lapsed", daysLeft: 0 };
  return { state: "active", daysLeft: Math.ceil(ms / 86_400_000) };
}
