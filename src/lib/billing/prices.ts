// Monthly price per self-serve plan, in centavos. Mirror zapflow-landing/src/lib/plans.ts.
export const PLAN_PRICE_CENTS = { basic: 8900, pro: 16900 } as const;
export type PaidPlan = keyof typeof PLAN_PRICE_CENTS;

export function priceForPlan(plan: PaidPlan): number {
  const cents = PLAN_PRICE_CENTS[plan];
  if (!cents) throw new Error(`No self-serve price for plan "${plan}"`);
  return cents;
}
