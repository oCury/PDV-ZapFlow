import { z } from "zod";

export const reportDateRangeSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  categoryId: z.string().optional(),
});

export const periodComparisonSchema = z.object({
  period1Start: z.string().min(1),
  period1End: z.string().min(1),
  period2Start: z.string().min(1),
  period2End: z.string().min(1),
});

export const exportReportSchema = z.object({
  reportType: z.enum(["abc", "margin", "turnover", "stale"]),
  format: z.enum(["csv"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export type ReportDateRange = z.infer<typeof reportDateRangeSchema>;
export type PeriodComparison = z.infer<typeof periodComparisonSchema>;
export type ExportReport = z.infer<typeof exportReportSchema>;
