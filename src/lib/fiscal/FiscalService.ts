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

import { prisma } from "@/lib/prisma";
import { resolveTenantId } from "@/lib/tenant/resolve-tenant";
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
   * Atomically get and increment the next NFC-e number for the given series.
   */
  static async getNextNumber(series: number = 1): Promise<number> {
    const tenantId = await resolveTenantId();
    const result = await prisma.$queryRaw<{ last_number: number }[]>`
      INSERT INTO fiscal_sequences (id, tenant_id, series, last_number)
      VALUES (gen_random_uuid(), ${tenantId}, ${series}, 1)
      ON CONFLICT (tenant_id, series)
      DO UPDATE SET last_number = fiscal_sequences.last_number + 1
      RETURNING last_number
    `;
    return result[0].last_number;
  }

  /**
   * Consult the current status of an NFC-e at the fiscal API.
   */
  static async consultStatus(saleId: string): Promise<FiscalApiResponse> {
    if (!this.isConfigured()) {
      return {
        status: "erro",
        errors: [
          { code: "NOT_CONFIGURED", message: "Fiscal API not configured" },
        ],
      };
    }

    try {
      const res = await fetch(`${FISCAL_API_URL}/nfce/${saleId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${FISCAL_API_TOKEN}`,
        },
      });

      if (!res.ok) {
        return {
          status: "erro",
          errors: [
            { code: String(res.status), message: "Erro ao consultar status" },
          ],
        };
      }

      return (await res.json()) as FiscalApiResponse;
    } catch (err) {
      return {
        status: "erro",
        errors: [{ code: "NETWORK", message: String(err) }],
      };
    }
  }

  /**
   * Enqueue a sale for later fiscal processing (contingency mode).
   */
  static async enqueue(
    saleId: string,
    payload: NfcePayload
  ): Promise<void> {
    await prisma.fiscalQueue.upsert({
      where: { sale_id: saleId },
      create: {
        sale_id: saleId,
        payload: JSON.stringify(payload),
        status: "PENDING",
      },
      update: {
        payload: JSON.stringify(payload),
        status: "PENDING",
        attempts: 0,
        last_error: null,
      },
    });
  }

  /**
   * Process pending items in the fiscal queue.
   */
  static async processQueue(): Promise<{
    processed: number;
    errors: number;
  }> {
    const pendingItems = await prisma.fiscalQueue.findMany({
      where: { status: "PENDING" },
      orderBy: { created_at: "asc" },
      take: 10,
      include: {
        sale: {
          include: {
            items: { include: { product: true } },
            payments: true,
            customer: true,
          },
        },
      },
    });

    let processed = 0;
    let errors = 0;

    for (const item of pendingItems) {
      await prisma.fiscalQueue.update({
        where: { id: item.id },
        data: { status: "PROCESSING", attempts: item.attempts + 1 },
      });

      try {
        const payload = JSON.parse(item.payload) as NfcePayload;
        const result = await this.transmit(item.sale_id, payload);

        if (result.status === "autorizado" || result.status === "processando") {
          await prisma.fiscalQueue.update({
            where: { id: item.id },
            data: { status: "SENT" },
          });

          if (result.accessKey) {
            await prisma.sale.update({
              where: { id: item.sale_id },
              data: {
                nfce_status: "authorized",
                nfce_access_key: result.accessKey,
                nfce_qr_url: result.qrCodeUrl ?? null,
                nfce_danfe_url: result.danfeUrl ?? null,
                nfce_protocol: result.protocol ?? null,
              },
            });
          }

          processed++;
        } else {
          const errorMsg =
            result.errors?.map((e) => e.message).join("; ") ?? "Unknown error";
          await prisma.fiscalQueue.update({
            where: { id: item.id },
            data: {
              status: "PENDING",
              last_error: errorMsg,
            },
          });
          await this.logEvent(item.sale_id, "retry_error", {
            attempt: item.attempts + 1,
            errors: result.errors,
          });
          errors++;
        }
      } catch (err) {
        await prisma.fiscalQueue.update({
          where: { id: item.id },
          data: {
            status: "PENDING",
            last_error: String(err),
          },
        });
        errors++;
      }
    }

    return { processed, errors };
  }

  /**
   * Log a fiscal event for audit trail.
   */
  static async logEvent(
    saleId: string,
    eventType: string,
    payload?: unknown
  ): Promise<void> {
    await prisma.fiscalEvent.create({
      data: {
        sale_id: saleId,
        event_type: eventType,
        payload: payload ? JSON.stringify(payload) : null,
      },
    });
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
        ncm?: string | null;
        cfop?: string | null;
        fiscal_unit?: string | null;
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
      ncm: item.product.ncm ?? "00000000",
      cfop: item.product.cfop ?? "5102",
      unit: item.product.fiscal_unit ?? "UN",
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
      const nfceNumber = await this.getNextNumber();
      const enrichedPayload = { ...payload, number: nfceNumber, series: 1 };

      const res = await fetch(`${FISCAL_API_URL}/nfce`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FISCAL_API_TOKEN}`,
          "X-Reference-Id": saleId,
        },
        body: JSON.stringify(enrichedPayload),
      });

      await this.logEvent(saleId, "transmitted", {
        number: nfceNumber,
        httpStatus: res.status,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const errorResponse: FiscalApiResponse = {
          status: "erro",
          errors: [
            {
              code: String(res.status),
              message: body.message ?? "API error",
            },
          ],
        };
        await this.logEvent(saleId, "error", {
          number: nfceNumber,
          errors: errorResponse.errors,
        });
        return errorResponse;
      }

      const result = (await res.json()) as FiscalApiResponse;

      // Persist nfce_number on the sale for reference
      await prisma.sale
        .update({
          where: { id: saleId },
          data: { nfce_number: nfceNumber, nfce_series: 1 },
        })
        .catch(() => {
          // Best-effort — webhook will also update
        });

      return result;
    } catch (err) {
      console.error("[FiscalService] Transmission error:", err);
      await this.logEvent(saleId, "error", { error: String(err) });
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
      return {
        status: "erro",
        errors: [
          { code: "NOT_CONFIGURED", message: "Fiscal API not configured" },
        ],
      };
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
