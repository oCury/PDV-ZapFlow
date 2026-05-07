import { z } from "zod";

export const emitNfceSchema = z.object({
  saleId: z.string().min(1),
  force: z.boolean().optional(),
});

export const cancelNfceSchema = z.object({
  saleId: z.string().min(1),
  reason: z
    .string()
    .min(15, "Motivo deve ter no mínimo 15 caracteres (exigência SEFAZ)"),
});

export const productFiscalSchema = z.object({
  ncm: z
    .string()
    .regex(/^\d{8}$/, "NCM deve ter 8 dígitos numéricos")
    .optional(),
  cfop: z
    .string()
    .regex(/^\d{4}$/, "CFOP deve ter 4 dígitos")
    .optional(),
  fiscalUnit: z.string().max(6).optional(),
});
