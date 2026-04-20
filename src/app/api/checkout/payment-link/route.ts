import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PaymentLinkItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
}

interface PaymentLinkRequestBody {
  saleId?: string;
  items: PaymentLinkItem[];
  customerId?: string;
  shippingCost?: number;
  shippingMethod?: string;
  channel?: string;
}

interface MpPreferenceItem {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
}

interface MpPreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MP_PREFERENCES_URL =
  "https://api.mercadopago.com/checkout/preferences";

const DEFAULT_CHANNEL = "ONLINE";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMpAccessToken(): string | null {
  return process.env.MERCADOPAGO_ACCESS_TOKEN ?? null;
}

function buildBackUrls(): {
  success: string;
  failure: string;
  pending: string;
} {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    success: `${baseUrl}/checkout/sucesso`,
    failure: `${baseUrl}/checkout/erro`,
    pending: `${baseUrl}/checkout/pendente`,
  };
}

function buildNotificationUrl(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/webhooks/mercadopago`;
}

function buildFallbackPixLink(saleId: string, total: number): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/checkout/pix?sale=${saleId}&total=${total}`;
}

async function resolveVariantSnapshot(
  variantId: string
): Promise<{ size: string | null; color: string | null }> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { size: true, color: true },
  });
  return {
    size: variant?.size ?? null,
    color: variant?.color ?? null,
  };
}

async function createMpPreference(
  items: MpPreferenceItem[],
  saleId: string
): Promise<MpPreferenceResponse> {
  const token = getMpAccessToken();
  if (!token) {
    throw new Error("MP_NOT_CONFIGURED");
  }

  const response = await fetch(MP_PREFERENCES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      items,
      back_urls: buildBackUrls(),
      auto_return: "approved",
      external_reference: saleId,
      notification_url: buildNotificationUrl(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Mercado Pago API ${response.status}: ${errorBody}`
    );
  }

  return response.json() as Promise<MpPreferenceResponse>;
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as PaymentLinkRequestBody;
    const {
      saleId: existingSaleId,
      items,
      customerId,
      shippingCost,
      shippingMethod,
      channel,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Lista de itens é obrigatória" },
        { status: 400 }
      );
    }

    // ── Resolve or create sale ──────────────────────────────────────────────
    let saleId: string;

    if (existingSaleId) {
      const existingSale = await prisma.sale.findUnique({
        where: { id: existingSaleId },
        select: { id: true },
      });
      if (!existingSale) {
        return NextResponse.json(
          { error: "Venda não encontrada" },
          { status: 404 }
        );
      }
      saleId = existingSale.id;
    } else {
      // Build sale items with variant snapshots
      const saleItems = await Promise.all(
        items.map(async (item) => {
          const snapshot = item.variantId
            ? await resolveVariantSnapshot(item.variantId)
            : { size: null, color: null };

          return {
            product_id: item.productId,
            variant_id: item.variantId ?? null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            size: snapshot.size,
            color: snapshot.color,
          };
        })
      );

      const subtotal = items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      );
      const totalAmount = subtotal + (shippingCost ?? 0);

      const sale = await prisma.sale.create({
        data: {
          total_amount: totalAmount,
          payment_method: "PIX",
          status: "PENDING",
          customer_id: customerId ?? null,
          shipping_cost: shippingCost ?? null,
          shipping_method: shippingMethod ?? null,
          channel: channel ?? DEFAULT_CHANNEL,
          items: { create: saleItems },
        },
      });

      saleId = sale.id;
    }

    // ── Fetch product names for MP preference ───────────────────────────────
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productNameMap = new Map(
      products.map((p) => [p.id, p.name])
    );

    const mpItems: MpPreferenceItem[] = items.map((item) => ({
      title: productNameMap.get(item.productId) ?? "Produto",
      quantity: item.quantity,
      unit_price: item.unitPrice,
      currency_id: "BRL",
    }));

    // Add shipping as an item if present
    if (shippingCost && shippingCost > 0) {
      mpItems.push({
        title: `Frete (${shippingMethod ?? "Envio"})`,
        quantity: 1,
        unit_price: shippingCost,
        currency_id: "BRL",
      });
    }

    // ── Create MP preference or fallback ────────────────────────────────────
    let paymentUrl: string;

    try {
      const preference = await createMpPreference(mpItems, saleId);
      paymentUrl = preference.init_point;
    } catch (error: unknown) {
      const isMpNotConfigured =
        error instanceof Error && error.message === "MP_NOT_CONFIGURED";

      if (!isMpNotConfigured) {
        throw error;
      }

      // Fallback: PIX link
      const total = mpItems.reduce(
        (sum, item) => sum + item.unit_price * item.quantity,
        0
      );
      paymentUrl = buildFallbackPixLink(saleId, total);
    }

    // ── Save payment link on sale ───────────────────────────────────────────
    await prisma.sale.update({
      where: { id: saleId },
      data: { payment_link: paymentUrl },
    });

    return NextResponse.json(
      { paymentUrl, saleId },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao gerar link de pagamento";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
