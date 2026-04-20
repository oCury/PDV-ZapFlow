import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { evolutionAPI } from "@/lib/whatsapp/evolution-api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotifyRequestBody {
  channel: "whatsapp" | "email";
}

interface SaleItemForMessage {
  productName: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatItemLine(item: Readonly<SaleItemForMessage>): string {
  const details: string[] = [];
  if (item.size) details.push(item.size);
  if (item.color) details.push(item.color);

  const detailSuffix =
    details.length > 0 ? ` (${details.join(", ")})` : "";

  return `- ${item.productName}${detailSuffix} x${item.quantity} — R$ ${formatCurrency(item.subtotal)}`;
}

function buildOrderMessage(
  saleId: string,
  items: ReadonlyArray<SaleItemForMessage>,
  subtotal: number,
  shippingCost: number,
  shippingMethod: string | null,
  total: number,
  paymentLink: string | null
): string {
  const shortId = saleId.slice(-6).toUpperCase();
  const itemLines = items.map(formatItemLine).join("\n");

  const shippingLabel = shippingMethod ?? "Envio";
  const shippingLine =
    shippingCost > 0
      ? `Frete (${shippingLabel}): R$ ${formatCurrency(shippingCost)}`
      : `Frete: Grátis`;

  const paymentLine = paymentLink
    ? `\n💳 Link de pagamento:\n${paymentLink}`
    : "";

  return [
    `🛒 *Resumo do Pedido #${shortId}*`,
    "",
    itemLines,
    "",
    `Subtotal: R$ ${formatCurrency(subtotal)}`,
    shippingLine,
    `*Total: R$ ${formatCurrency(total)}*`,
    paymentLine,
  ].join("\n");
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Acesso restrito a administradores" },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "ID da venda é obrigatório" },
        { status: 400 }
      );
    }

    const body = (await req.json()) as NotifyRequestBody;
    const { channel } = body;

    if (!channel || !["whatsapp", "email"].includes(channel)) {
      return NextResponse.json(
        { error: "Canal inválido. Use 'whatsapp' ou 'email'" },
        { status: 400 }
      );
    }

    // ── Fetch sale data ─────────────────────────────────────────────────────
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { size: true, color: true } },
          },
        },
        customer: {
          select: {
            name: true,
            phone: true,
            whatsapp: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venda não encontrada" },
        { status: 404 }
      );
    }

    // ── Build message ───────────────────────────────────────────────────────
    const items: SaleItemForMessage[] = sale.items.map((item) => {
      const unitPrice = Number(item.unit_price);
      return {
        productName: item.product.name,
        size: item.size ?? item.variant?.size ?? null,
        color: item.color ?? item.variant?.color ?? null,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      };
    });

    const subtotal = items.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );
    const shippingCost = Number(sale.shipping_cost ?? 0);
    const total = Number(sale.total_amount);

    const message = buildOrderMessage(
      sale.id,
      items,
      subtotal,
      shippingCost,
      sale.shipping_method,
      total,
      sale.payment_link
    );

    // ── Send via chosen channel ─────────────────────────────────────────────
    if (channel === "whatsapp") {
      const customerPhone =
        sale.customer?.whatsapp ?? sale.customer?.phone;

      if (!customerPhone) {
        return NextResponse.json(
          {
            error:
              "Cliente não possui telefone/WhatsApp cadastrado",
          },
          { status: 400 }
        );
      }

      if (!evolutionAPI.isConfigured()) {
        return NextResponse.json(
          { error: "WhatsApp não configurado no sistema" },
          { status: 503 }
        );
      }

      const result = await evolutionAPI.sendText({
        number: customerPhone,
        text: message,
      });

      if (!result.success) {
        return NextResponse.json(
          {
            error: `Falha ao enviar WhatsApp: ${result.error ?? "erro desconhecido"}`,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        channel: "whatsapp",
        message: "Notificação enviada via WhatsApp",
      });
    }

    // Email channel placeholder
    return NextResponse.json(
      { error: "Canal de e-mail ainda não implementado" },
      { status: 501 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao enviar notificação";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
