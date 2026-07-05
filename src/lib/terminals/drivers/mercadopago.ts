import { createTerminalOrder, getOrder, cancelOrder } from "@/lib/mercadopago/orders";
import { listDevices, setOperatingMode } from "@/lib/mercadopago/devices";
import { validateWebhookSignature } from "@/lib/mercadopago/checkout";
import { MpApiError } from "@/lib/mercadopago/client";
import { normalizeChargeStatus } from "../status";
import type {
  TerminalDriver,
  DriverResult,
  ProviderCharge,
  ProviderCredentials,
  CreateChargeInput,
  WebhookResolution,
  ProviderDevice,
  OperatorError,
} from "../types";

function token(creds: ProviderCredentials): string {
  return String(creds.accessToken ?? "");
}

function extractPayment(order: any): { id?: string; status?: string } {
  return order?.transactions?.payments?.[0] ?? {};
}

/**
 * Maps any error that carries a numeric `status` to an OperatorError.
 * Handles both real MpApiError instances and duck-typed errors (e.g. test mocks).
 */
function mapError(err: unknown): OperatorError {
  const status =
    err instanceof MpApiError
      ? err.status
      : typeof (err as any)?.status === "number"
        ? (err as any).status
        : null;
  if (status !== null) {
    if (status === 409) return { code: "DEVICE_BUSY", message: "Maquininha ocupada — cancele a cobrança anterior." };
    if (status === 403) return { code: "CONFIG", message: "Configuração do Mercado Pago inválida. Verifique o app/integração." };
    if (status === 400) return { code: "GENERIC", message: "Dados da cobrança inválidos." };
    return { code: "GENERIC", message: "Erro ao comunicar com a maquininha. Tente novamente." };
  }
  return { code: "OFFLINE", message: "Maquininha sem conexão. Verifique a internet do dispositivo." };
}

export const mercadoPagoDriver: TerminalDriver = {
  name: "mercadopago",
  capabilities: {
    deviceSync: true,
    operatingModes: true,
    cancel: true,
    installments: true,
    methods: ["CREDIT", "DEBIT", "PIX"],
  },

  async createCharge(creds: ProviderCredentials, input: CreateChargeInput): Promise<DriverResult<ProviderCharge>> {
    try {
      const order: any = await createTerminalOrder(
        {
          terminalDeviceId: input.deviceExternalId,
          amount: input.amount,
          method: input.method,
          installments: input.installments,
          externalRef: input.externalRef,
        },
        token(creds),
      );
      return {
        ok: true,
        data: {
          externalOrderId: order.id,
          status: normalizeChargeStatus(order.status ?? "created"),
          raw: order,
        },
      };
    } catch (err) {
      return { ok: false, error: mapError(err) };
    }
  },

  async getChargeStatus(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<ProviderCharge>> {
    try {
      const order: any = await getOrder(externalOrderId, token(creds));
      const p = extractPayment(order);
      return {
        ok: true,
        data: {
          externalOrderId,
          externalPaymentId: p.id,
          status: normalizeChargeStatus(p.status ?? order.status ?? "processing"),
          raw: order,
        },
      };
    } catch (err) {
      return { ok: false, error: mapError(err) };
    }
  },

  async cancelCharge(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<void>> {
    try {
      await cancelOrder(externalOrderId, token(creds));
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: mapError(err) };
    }
  },

  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean {
    const dataId = (() => {
      try {
        return JSON.parse(rawBody)?.data?.id ?? "";
      } catch {
        return "";
      }
    })();
    return validateWebhookSignature(
      headers["x-signature"] ?? "",
      headers["x-request-id"] ?? "",
      dataId,
    );
  },

  async parseWebhook(_headers: Record<string, string>, body: any): Promise<DriverResult<WebhookResolution>> {
    const orderId = body?.data?.id ?? body?.id;
    if (!orderId) return { ok: false, error: { code: "GENERIC", message: "webhook sem order id" } };
    return {
      ok: true,
      data: {
        providerName: "mercadopago",
        externalOrderId: String(orderId),
        status: "PROCESSING",
        tenantHint: body?.user_id
          ? { key: "external_account_id", value: String(body.user_id) }
          : undefined,
      },
    };
  },

  async listDevices(creds: ProviderCredentials): Promise<DriverResult<ProviderDevice[]>> {
    try {
      const devices = await listDevices(token(creds));
      return {
        ok: true,
        data: devices.map((d) => ({ id: d.id, operatingMode: d.operating_mode as "PDV" | "STANDALONE" | undefined })),
      };
    } catch (err) {
      return { ok: false, error: mapError(err) };
    }
  },

  async setOperatingMode(creds: ProviderCredentials, deviceId: string, mode: "PDV" | "STANDALONE"): Promise<DriverResult<void>> {
    try {
      await setOperatingMode(deviceId, mode, token(creds));
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: mapError(err) };
    }
  },
};
