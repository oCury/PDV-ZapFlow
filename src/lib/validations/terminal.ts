import { z } from "zod";

export const updateTerminalSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  is_active: z.boolean().optional(),
  location_label: z.string().max(60).nullable().optional(),
});

export const terminalChargeSchema = z.object({
  terminalId: z.string().min(1),
  method: z.enum(["CREDIT", "DEBIT", "PIX"]),
  installments: z.number().int().positive().default(1),
  totalAmount: z.number().positive(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().optional(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  customerId: z.string().optional(),
});
