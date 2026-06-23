import type { DeliveryStatus } from "@prisma/client";

/** Standard envelope returned by every carrier method. */
export interface CarrierResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface DeliveryQuoteInput {
  cep?: string | null;
  address?: string | null;
}

export interface DeliveryDispatchInput {
  saleId: string;
  recipientName?: string | null;
  recipientPhone?: string | null;
  address?: string | null;
  cep?: string | null;
}

export interface DeliveryQuote {
  fee: number;
  etaMinutes?: number;
}

export interface DeliveryDispatchResult {
  externalId?: string;
  trackingCode?: string;
  trackingUrl?: string;
}

/**
 * Provider-agnostic courier interface. Concrete carriers (manual, 99, Correios…)
 * implement this so the API and UI never depend on a specific provider.
 */
export interface DeliveryCarrier {
  readonly name: string;
  quote(input: DeliveryQuoteInput): Promise<CarrierResult<DeliveryQuote>>;
  dispatch(input: DeliveryDispatchInput): Promise<CarrierResult<DeliveryDispatchResult>>;
  getStatus(externalId: string): Promise<CarrierResult<{ status: DeliveryStatus }>>;
  cancel(externalId: string): Promise<CarrierResult>;
}

// ─── Pure logic shared by API, UI and tests ───────────────────────────────────

const DELIVERY_SHIPPING_METHODS = new Set(["MOTOBOY", "CORREIOS", "TRANSPORTADORA"]);
const DELIVERY_CHANNELS = new Set(["ONLINE", "WHATSAPP"]);

/**
 * A sale needs delivery when it ships via a delivery method (not in-store pickup)
 * or comes from a remote channel. RETIRADA (pickup) is intentionally excluded.
 */
export function isDeliverableSale(sale: {
  shipping_method?: string | null;
  channel?: string | null;
}): boolean {
  const method = (sale.shipping_method ?? "").toUpperCase();
  const channel = (sale.channel ?? "").toUpperCase();
  return DELIVERY_SHIPPING_METHODS.has(method) || DELIVERY_CHANNELS.has(channel);
}

/** Allowed delivery status transitions. Staying on the same status is a no-op (allowed). */
const ALLOWED_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ["READY", "DISPATCHED", "CANCELLED"],
  READY: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED", "FAILED"],
  FAILED: ["DISPATCHED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export type StatusMessageKind = "dispatched" | "delivered";

/** Builds the default pt-BR WhatsApp message for a status change (operator can edit it). */
export function buildStatusMessage(
  kind: StatusMessageKind,
  ctx: { name?: string | null }
): string {
  const greeting = ctx.name ? `Olá ${ctx.name}!` : "Olá!";
  switch (kind) {
    case "dispatched":
      return `${greeting} Seu pedido saiu para entrega 🛵 e chega em breve.`;
    case "delivered":
      return `${greeting} Seu pedido foi entregue ✅. Obrigado pela preferência!`;
  }
}
