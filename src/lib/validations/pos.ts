import { z } from "zod";

// ─── Cart ────────────────────────────────────────────────────────────────────

export const cartItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
});

export const saleItemPayloadSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  size: z.string().optional(),
  color: z.string().optional(),
});

// ─── Payments ────────────────────────────────────────────────────────────────

export const paymentSplitSchema = z.object({
  paymentMethod: z.enum(["CASH", "CARD", "PIX", "LOYALTY"]),
  amount: z.number().positive(),
});

// ─── Sale ────────────────────────────────────────────────────────────────────

export const createSaleSchema = z
  .object({
    totalAmount: z.number().positive(),
    items: z.array(saleItemPayloadSchema).min(1),
    payments: z.array(paymentSplitSchema).optional(),
    paymentMethod: z.enum(["CASH", "CARD", "PIX", "LOYALTY"]).optional(),
    customerId: z.string().optional(),
    customerPhone: z.string().optional(),
    tableId: z.string().optional(),
    loyaltyDiscount: z.number().nonnegative().optional(),
    notes: z.string().max(500).optional(),
    shippingCost: z.number().nonnegative().optional(),
    shippingMethod: z.string().optional(),
    shippingAddress: z.string().optional(),
    shippingCep: z.string().optional(),
    channel: z.enum(["PDV", "ONLINE", "WHATSAPP"]).optional(),
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

// ─── Customer (M3) ───────────────────────────────────────────────────────────

/**
 * Validates a Brazilian CPF (Cadastro de Pessoas Físicas).
 * Checks the format and the two check digits using the standard algorithm.
 */
function validateCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all same digits

  const calc = (end: number) => {
    let sum = 0;
    for (let i = 0; i < end; i++) {
      sum += parseInt(cpf[i]) * (end + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}

export const cpfSchema = z
  .string()
  .min(11, "CPF deve ter 11 dígitos")
  .refine((v) => validateCPF(v), { message: "CPF inválido" });

export const customerSearchSchema = z.object({
  phone: z.string().min(10).max(20).optional(),
  cpf: cpfSchema.optional(),
}).refine((d) => d.phone || d.cpf, {
  message: "Informe telefone ou CPF para buscar",
});

export const upsertCustomerSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional().or(z.literal("")),
  whatsapp: z.string().min(10).max(20).optional(),
  cpf: cpfSchema.optional(),
});

// ─── Inventory (M2) ──────────────────────────────────────────────────────────

export const updateStockThresholdSchema = z.object({
  productId: z.string().min(1),
  minStock: z.number().int().nonnegative(),
});

// ─── Cash Register ───────────────────────────────────────────────────────────

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

// ─── Tables (M5) ─────────────────────────────────────────────────────────────

export const createTableSchema = z.object({
  number: z.number().int().positive(),
  name: z.string().max(60).optional(),
  capacity: z.number().int().positive().default(4),
  whatsapp: z.string().max(20).optional(),
});

export const openOrderSchema = z.object({
  tableId: z.string().min(1),
  items: z.array(saleItemPayloadSchema).min(1),
  /** Required for table orders — used to charge if customer leaves without paying */
  customerPhone: z.string().min(10, "Telefone obrigatório (mín. 10 dígitos)"),
  customerId: z.string().optional(), // if found via search
  notes: z.string().max(500).optional(),
});

// ─── Exports ─────────────────────────────────────────────────────────────────

export type CartItem = z.infer<typeof cartItemSchema>;
export type SaleItemPayload = z.infer<typeof saleItemPayloadSchema>;
export type PaymentSplit = z.infer<typeof paymentSplitSchema>;
export type UpsertCustomer = z.infer<typeof upsertCustomerSchema>;
