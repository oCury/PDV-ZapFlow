import type { TerminalChargeStatus, TerminalChargeMethod, TerminalProviderName } from "@prisma/client";
import type { OperatorError } from "@/lib/mercadopago/errors";
export type { OperatorError } from "@/lib/mercadopago/errors";
export type { TerminalProviderName } from "@prisma/client";

export type DriverResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: OperatorError };

export type ProviderCredentials = Record<string, unknown>;

export interface CreateChargeInput {
  deviceExternalId: string;
  amount: number;
  method: TerminalChargeMethod;
  installments: number;
  externalRef: string;
}

export interface ProviderCharge {
  externalOrderId: string;
  externalPaymentId?: string;
  status: TerminalChargeStatus;
  cardBrand?: string;
  raw?: unknown;
}

export interface WebhookResolution {
  providerName: TerminalProviderName;
  externalOrderId: string;
  status: TerminalChargeStatus;
  externalPaymentId?: string;
  cardBrand?: string;
  tenantHint?: { key: string; value: string };
}

export interface ProviderDevice {
  id: string;
  operatingMode?: "PDV" | "STANDALONE";
}

export interface DriverCapabilities {
  deviceSync: boolean;
  operatingModes: boolean;
  cancel: boolean;
  installments: boolean;
  methods: TerminalChargeMethod[];
}

export interface TerminalDriver {
  readonly name: TerminalProviderName;
  readonly capabilities: DriverCapabilities;

  createCharge(creds: ProviderCredentials, input: CreateChargeInput): Promise<DriverResult<ProviderCharge>>;
  getChargeStatus(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<ProviderCharge>>;
  cancelCharge(creds: ProviderCredentials, externalOrderId: string): Promise<DriverResult<void>>;

  verifyWebhook(headers: Record<string, string>, rawBody: string, creds?: ProviderCredentials): boolean;
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<DriverResult<WebhookResolution>>;

  listDevices?(creds: ProviderCredentials): Promise<DriverResult<ProviderDevice[]>>;
  setOperatingMode?(creds: ProviderCredentials, deviceId: string, mode: "PDV" | "STANDALONE"): Promise<DriverResult<void>>;
}
