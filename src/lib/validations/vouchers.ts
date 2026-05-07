import { z } from "zod";

export const createVoucherSchema = z.object({
  type: z.enum(["EXCHANGE", "GIFT"]),
  originalValue: z.number().positive(),
  customerId: z.string().optional(),
  expiresInDays: z.number().int().positive().optional(), // default 90
});

export const redeemVoucherSchema = z.object({
  code: z.string().min(1),
  amount: z.number().positive(),
  saleId: z.string().min(1),
});

export const voucherQuerySchema = z.object({
  status: z.enum(["ACTIVE", "USED", "EXPIRED", "CANCELLED"]).optional(),
  customerId: z.string().optional(),
  code: z.string().optional(),
});

export type CreateVoucher = z.infer<typeof createVoucherSchema>;
export type RedeemVoucher = z.infer<typeof redeemVoucherSchema>;
export type VoucherQuery = z.infer<typeof voucherQuerySchema>;
