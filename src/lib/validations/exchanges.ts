import { z } from "zod";

// ─── Create Exchange ────────────────────────────────────────────────────────

export const createExchangeSchema = z.object({
  originalSaleId: z.string().min(1, "ID da venda original obrigatorio"),
  reason: z.enum(["WRONG_SIZE", "DEFECT", "DISLIKE", "OTHER"]),
  reasonDetail: z.string().max(500).optional(),
  refundMethod: z.enum(["VOUCHER", "CASH", "ORIGINAL_METHOD"]),
  items: z
    .array(
      z.object({
        originalItemId: z.string().min(1),
        action: z.enum(["RETURN", "EXCHANGE"]),
        quantity: z.number().int().positive(),
      })
    )
    .min(1, "Selecione ao menos um item para troca/devolucao"),
});

// ─── Approve Exchange ───────────────────────────────────────────────────────

export const approveExchangeSchema = z.object({
  exchangeId: z.string().min(1),
});

// ─── Exports ────────────────────────────────────────────────────────────────

export type CreateExchangeInput = z.infer<typeof createExchangeSchema>;
export type ApproveExchangeInput = z.infer<typeof approveExchangeSchema>;
