/**
 * FiscalService — NFC-e issuance service layer
 *
 * This is a production-ready boilerplate. To activate, you need to:
 *  1. Set FISCAL_API_URL, FISCAL_API_TOKEN in .env
 *  2. Fill in the issuer data (CNPJ, IE, address)
 *  3. Map each product's NCM, CFOP, ICMS/PIS/COFINS rates
 *  4. Replace FISCAL_WEBHOOK_SECRET with a real secret
 *
 * Compatible with FocusNFe (https://focusnfe.com.br) and
 * PlugNotas (https://plugnotas.com.br). Both follow a similar REST shape.
 */

import type {
  NfcePayload,
  FiscalApiResponse,
  FiscalIssuer,
  FiscalProduct,
  FiscalPayment,
  FiscalConsumer,
} from "./types";

// ─── Configuration (from .env) ───────────────────────────────────────────────

const FISCAL_API_URL = process.env.FISCAL_API_URL ?? "";
const FISCAL_API_TOKEN = process.env.FISCAL_API_TOKEN ?? "";

/**
 * Issuer data — fill with real company data before production.
 * Consider moving this to an admin-managed database record.
 */
const DEFAULT_ISSUER: FiscalIssuer = {
  name: process.env.FISCAL_COMPANY_NAME ?? "EMPRESA LTDA",
  cnpj: process.env.FISCAL_CNPJ ?? "00000000000000",
  ie: process.env.FISCAL_IE ?? "ISENTO",
  crt: 1, // Simples Nacional
  address: {
    street: process.env.FISCAL_STREET ?? "Rua Exemplo",
    number: process.env.FISCAL_NUMBER ?? "100",
    district: process.env.FISCAL_DISTRICT ?? "Centro",
    city: process.env.FISCAL_CITY ?? "São Paulo",
    state: process.env.FISCAL_STATE ?? "SP",
    zipCode: process.env.FISCAL_ZIP ?? "01310-100",
    cityCode: process.env.FISCAL_CITY_CODE ?? "3550308",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map our internal payment method enum to NFC-e codes */
function toFiscalPaymentCode(method: string): FiscalPayment["method"] {
  const map: Record<string, FiscalPayment["method"]> = {
    CASH: "01",
    CARD: "03",
    PIX: "17",
    LOYALTY: "99",
  };
  return map[method] ?? "99";
}

// ─── Service class ───────────────────────────────────────────────────────────

export class FiscalService {
  private static isConfigured(): boolean {
    return Boolean(FISCAL_API_URL && FISCAL_API_TOKEN);
  }

  /**
   * Build the NFC-e payload from a confirmed sale.
   *
   * @param sale - Sale record including items, payments, and optional customer
   */
  static buildNfcePayload(sale: {
    id: string;
    total_amount: number;
    loyalty_discount?: number | null;
    items: {
      product: {
        id: string;
        name: string;
        barcode: string;
        sell_price: number;
      };
      quantity: number;
      unit_price: number;
    }[];
    payments: { payment_method: string; amount: number }[];
    customer?: { cpf?: string | null; name?: string | null } | null;
  }): NfcePayload {
    const consumer: FiscalConsumer | undefined = sale.customer?.cpf
      ? { document: sale.customer.cpf, name: sale.customer.name ?? undefined }
      : undefined;

    const products: FiscalProduct[] = sale.items.map((item) => ({
      code: item.product.id,
      description: item.product.name,
      // TODO: fetch per-product NCM from the database
      ncm: "22021000", // placeholder — soft drink; MUST be per-product
      cfop: "5102",
      unit: "UN",
      quantity: item.quantity,
      unitValue: Number(item.unit_price),
      totalValue: Number(item.unit_price) * item.quantity,
      icms: {
        origin: 0,
        cst: "500", // CSOSN 500 — Simples Nacional, tributado
      },
      pis: { cst: "07", bc: 0, rate: 0, value: 0 },
      cofins: { cst: "07", bc: 0, rate: 0, value: 0 },
    }));

    const fiscalPayments: FiscalPayment[] = sale.payments.map((p) => ({
      method: toFiscalPaymentCode(p.payment_method),
      amount: Number(p.amount),
    }));

    const totalProducts = products.reduce((s, p) => s + p.totalValue, 0);
    const discount = Number(sale.loyalty_discount ?? 0);

    return {
      model: 65,
      nature: "Venda ao consumidor",
      issuer: DEFAULT_ISSUER,
      consumer,
      products,
      payments: fiscalPayments,
      totalProducts,
      totalNote: totalProducts - discount,
      ...(discount > 0 ? { discount } : {}),
    };
  }

  /**
   * Transmit the NFC-e to the fiscal API.
   * Returns a FiscalApiResponse with status, accessKey, and DANFE URL.
   *
   * This is an async fire-and-forget in most flows; the final status arrives
   * via the /api/fiscal/webhook route (see below).
   */
  static async transmit(
    saleId: string,
    payload: NfcePayload
  ): Promise<FiscalApiResponse> {
    if (!this.isConfigured()) {
      console.warn(
        "[FiscalService] Fiscal API not configured — skipping NFC-e transmission."
      );
      return { status: "processando" };
    }

    try {
      const res = await fetch(`${FISCAL_API_URL}/nfce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FISCAL_API_TOKEN}`,
          "X-Reference-Id": saleId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          status: "erro",
          errors: [{ code: String(res.status), message: body.message ?? "API error" }],
        };
      }

      return (await res.json()) as FiscalApiResponse;
    } catch (err) {
      console.error("[FiscalService] Transmission error:", err);
      return {
        status: "erro",
        errors: [{ code: "NETWORK", message: String(err) }],
      };
    }
  }

  /**
   * Issue a cancellation request for an already-authorized NFC-e.
   */
  static async cancel(
    accessKey: string,
    reason: string
  ): Promise<FiscalApiResponse> {
    if (!this.isConfigured()) {
      return { status: "erro", errors: [{ code: "NOT_CONFIGURED", message: "Fiscal API not configured" }] };
    }

    const res = await fetch(`${FISCAL_API_URL}/nfce/${accessKey}/cancel`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FISCAL_API_TOKEN}`,
      },
      body: JSON.stringify({ reason }),
    });

    if (!res.ok) {
      return { status: "erro" };
    }
    return (await res.json()) as FiscalApiResponse;
  }
}
