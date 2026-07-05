import { stoneFetch } from "@/lib/stone/client";
import { normalizeChargeStatus } from "../status";
import type { TerminalDriver, DriverResult, ProviderCharge, ProviderCredentials, WebhookResolution, OperatorError } from "../types";

function apiKey(c: ProviderCredentials) { return String(c.apiKey ?? ""); }
function toOperatorError(err: any): OperatorError {
  const status = err?.status;
  if (status === 409) return { code: "DEVICE_BUSY", message: "Maquininha ocupada." };
  if (status === 403) return { code: "CONFIG", message: "Credenciais Stone inválidas." };
  if (typeof status === "number") return { code: "GENERIC", message: "Erro ao comunicar com a Stone." };
  return { code: "OFFLINE", message: "Maquininha sem conexão." };
}

export const stoneDriver: TerminalDriver = {
  name: "stone",
  capabilities: { deviceSync: false, operatingModes: false, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"] },

  async createCharge(creds, input): Promise<DriverResult<ProviderCharge>> {
    try {
      const order = await stoneFetch("/orders", {
        method: "POST", apiKey: apiKey(creds),
        body: JSON.stringify({
          items: [{ amount: Math.round(input.amount * 100), description: "PDV", quantity: 1 }],
          device_id: input.deviceExternalId,
          code: input.externalRef,
          payments: [{ payment_method: input.method.toLowerCase(), installments: input.installments }],
        }),
      });
      return { ok: true, data: { externalOrderId: order.id, status: normalizeChargeStatus(order.status ?? "pending"), raw: order } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async getChargeStatus(creds, externalOrderId): Promise<DriverResult<ProviderCharge>> {
    try {
      const order = await stoneFetch(`/orders/${externalOrderId}`, { method: "GET", apiKey: apiKey(creds) });
      const charge = order?.charges?.[0] ?? {};
      return { ok: true, data: { externalOrderId, externalPaymentId: charge.id, status: normalizeChargeStatus(charge.status ?? order.status ?? "processing"), cardBrand: charge?.last_transaction?.card?.brand, raw: order } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async cancelCharge(creds, externalOrderId): Promise<DriverResult<void>> {
    try { await stoneFetch(`/orders/${externalOrderId}/closed`, { method: "PATCH", apiKey: apiKey(creds), body: JSON.stringify({ status: "canceled" }) }); return { ok: true, data: undefined }; }
    catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  verifyWebhook(headers, rawBody, creds) {
    const sig = headers["x-hub-signature"];
    const secret = creds ? String((creds as any).webhookSecret ?? "") : "";
    if (!sig || !secret) return true; // sandbox / unset secret
    const { createHmac } = require("crypto");
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    return sig === expected;
  },

  async parseWebhook(_headers, body: any): Promise<DriverResult<WebhookResolution>> {
    const order = body?.data ?? body;
    const orderId = order?.id;
    if (!orderId) return { ok: false, error: { code: "GENERIC", message: "webhook Stone sem id" } };
    const charge = order?.charges?.[0] ?? {};
    return { ok: true, data: { providerName: "stone", externalOrderId: String(orderId), externalPaymentId: charge.id, status: normalizeChargeStatus(charge.status ?? order.status ?? "processing"), cardBrand: charge?.last_transaction?.card?.brand, tenantHint: order?.merchant_id ? { key: "external_account_id", value: String(order.merchant_id) } : undefined } };
  },
};
