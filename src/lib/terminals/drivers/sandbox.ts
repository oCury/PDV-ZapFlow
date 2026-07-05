import type { TerminalDriver, DriverResult, ProviderCharge, WebhookResolution } from "../types";
import type { TerminalProviderName } from "@prisma/client";

const APPROVE_AFTER_MS = 4_000;

/**
 * A realistic mock driver: createCharge encodes creation time into the order id,
 * so the existing poll path finalizes it after APPROVE_AFTER_MS with no timers.
 */
export function sandboxDriver(name: TerminalProviderName): TerminalDriver {
  return {
    name,
    capabilities: { deviceSync: false, operatingModes: false, cancel: true, installments: true, methods: ["CREDIT", "DEBIT", "PIX"] },

    async createCharge(_creds, input): Promise<DriverResult<ProviderCharge>> {
      const externalOrderId = `sbx_${input.externalRef}_${Date.now()}`;
      return { ok: true, data: { externalOrderId, status: "PROCESSING" } };
    },

    async getChargeStatus(_creds, externalOrderId): Promise<DriverResult<ProviderCharge>> {
      const createdAt = Number(externalOrderId.split("_").pop());
      const approved = Number.isFinite(createdAt) && Date.now() - createdAt >= APPROVE_AFTER_MS;
      return {
        ok: true,
        data: {
          externalOrderId,
          externalPaymentId: approved ? `${externalOrderId}_pay` : undefined,
          status: approved ? "APPROVED" : "PROCESSING",
          cardBrand: approved ? "sandbox" : undefined,
        },
      };
    },

    async cancelCharge() { return { ok: true, data: undefined }; },

    verifyWebhook() { return true; },

    async parseWebhook(_headers, body: any): Promise<DriverResult<WebhookResolution>> {
      const externalOrderId = String(body?.externalOrderId ?? "");
      return { ok: true, data: { providerName: name, externalOrderId, status: "APPROVED", externalPaymentId: `${externalOrderId}_pay`, cardBrand: "sandbox" } };
    },
  };
}
