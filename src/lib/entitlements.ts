// Single source of truth for plan gating. Mirrors
// docs/superpowers/specs/2026-06-25-plans-entitlements.md. Pure — no I/O.

export const PLANS = ["basic", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export type EntitlementKey =
  | "pdv" | "catalog" | "inventory" | "payments.core" | "payments.terminal"
  | "customers" | "cashregister" | "reports.basic"
  | "payments.installments" | "fiscal.nfce" | "whatsapp" | "loyalty"
  | "vouchers" | "commissions" | "deliveries" | "labels" | "tables"
  | "reports.advanced"
  | "multistore";

const BASIC_KEYS: readonly EntitlementKey[] = [
  "pdv", "catalog", "inventory", "payments.core", "payments.terminal",
  "customers", "cashregister", "reports.basic",
];
const PRO_KEYS: readonly EntitlementKey[] = [
  ...BASIC_KEYS,
  "payments.installments", "fiscal.nfce", "whatsapp", "loyalty",
  "vouchers", "commissions", "deliveries", "labels", "tables", "reports.advanced",
];
const ENTERPRISE_KEYS: readonly EntitlementKey[] = [...PRO_KEYS, "multistore"];

export const PLAN_ENTITLEMENTS: Record<Plan, ReadonlySet<EntitlementKey>> = {
  basic: new Set(BASIC_KEYS),
  pro: new Set(PRO_KEYS),
  enterprise: new Set(ENTERPRISE_KEYS),
};

export const PLAN_LIMITS: Record<Plan, { seats: number | null }> = {
  basic: { seats: 1 },
  pro: { seats: 3 },
  enterprise: { seats: null },
};

/** Normalize a raw plan value (DB enum/string) to a Plan; null/unknown → basic (fail-closed). */
export function planFromTenant(plan: string | null | undefined): Plan {
  return plan === "pro" || plan === "enterprise" ? plan : "basic";
}
export function hasEntitlement(plan: Plan, key: EntitlementKey): boolean {
  return PLAN_ENTITLEMENTS[plan].has(key);
}
export function allowedKeys(plan: Plan): EntitlementKey[] {
  return [...PLAN_ENTITLEMENTS[plan]];
}
export function seatLimit(plan: Plan): number | null {
  return PLAN_LIMITS[plan].seats;
}
