import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SummaryItem {
  productName: string;
  variantId: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface SaleSummary {
  saleId: string;
  status: string;
  channel: string;
  items: SummaryItem[];
  subtotal: number;
  shippingCost: number;
  shippingMethod: string | null;
  total: number;
  paymentLink: string | null;
  paymentStatus: string;
  payments: Array<{
    method: string;
    amount: number;
    createdAt: string;
  }>;
  customer: {
    id: string;
    name: string | null;
    phone: string;
    whatsapp: string | null;
  } | null;
  createdAt: string;
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "ID da venda é obrigatório" },
        { status: 400 }
      );
    }

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
            variant: {
              select: { size: true, color: true, sku: true },
            },
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            whatsapp: true,
          },
        },
        payments: {
          select: {
            payment_method: true,
            amount: true,
            created_at: true,
          },
          orderBy: { created_at: "asc" },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venda não encontrada" },
        { status: 404 }
      );
    }

    const items: SummaryItem[] = sale.items.map((item) => {
      const unitPrice = Number(item.unit_price);
      return {
        productName: item.product.name,
        variantId: item.variant_id,
        size: item.size ?? item.variant?.size ?? null,
        color: item.color ?? item.variant?.color ?? null,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const shippingCost = Number(sale.shipping_cost ?? 0);
    const total = Number(sale.total_amount);

    const paymentStatus = derivePaymentStatus(sale.status, sale.payments);

    const summary: SaleSummary = {
      saleId: sale.id,
      status: sale.status,
      channel: sale.channel,
      items,
      subtotal: roundPrice(subtotal),
      shippingCost: roundPrice(shippingCost),
      shippingMethod: sale.shipping_method,
      total: roundPrice(total),
      paymentLink: sale.payment_link,
      paymentStatus,
      payments: sale.payments.map((p) => ({
        method: p.payment_method,
        amount: Number(p.amount),
        createdAt: p.created_at.toISOString(),
      })),
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name,
            phone: sale.customer.phone,
            whatsapp: sale.customer.whatsapp,
          }
        : null,
      createdAt: sale.created_at.toISOString(),
    };

    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao buscar resumo da venda";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function derivePaymentStatus(
  saleStatus: string,
  payments: Array<{ amount: unknown }>
): string {
  if (saleStatus === "APPROVED" || saleStatus === "COMPLETED") {
    return "Pago";
  }
  if (saleStatus === "CANCELLED") {
    return "Cancelado";
  }
  if (payments.length > 0) {
    return "Pagamento parcial";
  }
  return "Aguardando pagamento";
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}
