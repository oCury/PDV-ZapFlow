import { connectTefFetch } from "@/lib/connecttef/client";
import { normalizeChargeStatus } from "../status";
import type { TerminalDriver, DriverResult, ProviderCharge, ProviderCredentials, WebhookResolution, OperatorError } from "../types";

function cfg(c: ProviderCredentials) { return { endpoint: String(c.endpoint ?? ""), agentToken: String(c.agentToken ?? ""), merchantId: String(c.merchantId ?? "") }; }
function toOperatorError(err: any): OperatorError {
  if (err?.status === 409) return { code: "DEVICE_BUSY", message: "Terminal ocupado." };
  if (err?.status === 401 || err?.status === 403) return { code: "CONFIG", message: "Agente ConnectTEF não autorizado." };
  if (typeof err?.status === "number") return { code: "GENERIC", message: "Erro no ConnectTEF." };
  return { code: "OFFLINE", message: "SmartPOS sem conexão." };
}

export const connectTefDriver: TerminalDriver = {
  name: "connecttef",
  capabilities: { deviceSync: false, operatingModes: false, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"] },

  async createCharge(creds, input): Promise<DriverResult<ProviderCharge>> {
    const { endpoint, agentToken, merchantId } = cfg(creds);
    try {
      const tx = await connectTefFetch(endpoint, "/transactions", {
        method: "POST", agentToken,
        body: JSON.stringify({ merchant_id: merchantId, pos_id: input.deviceExternalId, amount_cents: Math.round(input.amount * 100), payment_type: input.method.toLowerCase(), installments: input.installments, reference: input.externalRef }),
      });
      return { ok: true, data: { externalOrderId: tx.transactionId, status: normalizeChargeStatus(tx.status ?? "processing"), raw: tx } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async getChargeStatus(creds, externalOrderId): Promise<DriverResult<ProviderCharge>> {
    const { endpoint, agentToken } = cfg(creds);
    try {
      const tx = await connectTefFetch(endpoint, `/transactions/${externalOrderId}`, { method: "GET", agentToken });
      return { ok: true, data: { externalOrderId, externalPaymentId: tx.nsu ?? tx.authorizationCode, status: normalizeChargeStatus(tx.status ?? "processing"), cardBrand: tx.cardBrand, raw: tx } };
    } catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  async cancelCharge(creds, externalOrderId): Promise<DriverResult<void>> {
    const { endpoint, agentToken } = cfg(creds);
    try { await connectTefFetch(endpoint, `/transactions/${externalOrderId}/cancel`, { method: "POST", agentToken }); return { ok: true, data: undefined }; }
    catch (err) { return { ok: false, error: toOperatorError(err) }; }
  },

  verifyWebhook() { return true; },

  async parseWebhook(_headers, body: any): Promise<DriverResult<WebhookResolution>> {
    const txId = body?.transactionId ?? body?.data?.transactionId;
    if (!txId) return { ok: false, error: { code: "GENERIC", message: "webhook ConnectTEF sem id" } };
    return { ok: true, data: { providerName: "connecttef", externalOrderId: String(txId), externalPaymentId: body?.nsu, status: normalizeChargeStatus(body?.status ?? "processing"), cardBrand: body?.cardBrand, tenantHint: body?.merchant_id ? { key: "external_account_id", value: String(body.merchant_id) } : undefined } };
  },
};
