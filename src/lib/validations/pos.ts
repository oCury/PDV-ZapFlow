import { z } from "zod";

export const cartItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
});

export const saleItemPayloadSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export const paymentSplitSchema = z.object({
  paymentMethod: z.enum(["CASH", "CARD", "PIX"]),
  amount: z.number().positive(),
});

export const createSaleSchema = z
  .object({
    totalAmount: z.number().positive(),
    items: z.array(saleItemPayloadSchema).min(1),
    payments: z.array(paymentSplitSchema).optional(),
    paymentMethod: z.enum(["CASH", "CARD", "PIX"]).optional(),
    customerId: z.string().optional(),
    customerPhone: z.string().optional(),
  })
  .refine(
    (data) => data.payments?.length || data.paymentMethod,
    { message: "Either payments or paymentMethod is required", path: ["payments"] }
  )
  .refine(
    (data) => {
      if (data.payments && data.payments.length > 0) {
        const sum = data.payments.reduce((s, p) => s + p.amount, 0);
        return Math.abs(sum - data.totalAmount) < 0.01;
      }
      return true;
    },
    { message: "Sum of payments must equal total amount", path: ["payments"] }
  );

export const createIntentSchema = z.object({
  amount: z.number().positive(),
  deviceId: z.string().min(1),
  items: z.array(saleItemPayloadSchema).min(1),
});

export const customerSearchSchema = z.object({
  phone: z.string().min(10).max(20),
});

export const openShiftSchema = z.object({
  openingCash: z.number().nonnegative(),
});

export const closeShiftSchema = z.object({
  closingCash: z.number().nonnegative(),
  shiftId: z.string().min(1),
});

export const withdrawalSchema = z.object({
  amount: z.number().positive(),
  shiftId: z.string().min(1),
  reason: z.string().optional(),
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type SaleItemPayload = z.infer<typeof saleItemPayloadSchema>;
export type PaymentSplit = z.infer<typeof paymentSplitSchema>;
