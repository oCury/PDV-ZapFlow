import { z } from "zod";

// ─── Label Generation Request ───────────────────────────────────────────────

export const labelItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().max(100),
});

export const generateLabelsSchema = z.object({
  items: z.array(labelItemSchema).min(1),
  templateId: z.enum(["40x25", "50x30", "custom"]).default("40x25"),
});

export type GenerateLabelsInput = z.infer<typeof generateLabelsSchema>;

// ─── Label Template ─────────────────────────────────────────────────────────

export const labelTemplateSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  columns: z.number().int().positive().max(5),
  rows: z.number().int().positive().max(15),
  fontSize: z.number().positive().default(8),
  showPrice: z.boolean().default(true),
  showBarcode: z.boolean().default(true),
  showSize: z.boolean().default(true),
  showColor: z.boolean().default(true),
});

export type LabelTemplate = z.infer<typeof labelTemplateSchema>;

// ─── Label Item Data (returned by API) ──────────────────────────────────────

export interface LabelItemData {
  productId: string;
  variantId?: string;
  name: string;
  barcode: string;
  price: number;
  size?: string;
  color?: string;
  sku?: string;
  quantity: number;
}
