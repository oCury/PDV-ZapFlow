import { z } from "zod";

// ─── Commission Rules ───────────────────────────────────────────────────────

export const createCommissionRuleSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(["FIXED_PERCENT", "CATEGORY_PERCENT", "TIERED"]),
  defaultPercent: z.number().min(0).max(100),
  categoryRules: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        percent: z.number().min(0).max(100),
      })
    )
    .optional(),
  tiers: z
    .array(
      z.object({
        minRevenue: z.number().min(0),
        maxRevenue: z.number().min(0).optional(),
        percent: z.number().min(0).max(100),
      })
    )
    .optional(),
});

export const updateCommissionRuleSchema = createCommissionRuleSchema.partial().omit({ userId: true });

// ─── Sales Goals ────────────────────────────────────────────────────────────

export const createSalesGoalSchema = z.object({
  userId: z.string().min(1),
  period: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  target: z.number().positive(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// ─── Query ──────────────────────────────────────────────────────────────────

export const commissionQuerySchema = z.object({
  userId: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type CreateCommissionRule = z.infer<typeof createCommissionRuleSchema>;
export type UpdateCommissionRule = z.infer<typeof updateCommissionRuleSchema>;
export type CreateSalesGoal = z.infer<typeof createSalesGoalSchema>;
export type CommissionQuery = z.infer<typeof commissionQuerySchema>;
