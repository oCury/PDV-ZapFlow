import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const exchange = await prisma.exchange.findUnique({
      where: { id },
      include: {
        original_sale: {
          select: {
            id: true,
            total_amount: true,
            payment_method: true,
            created_at: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        items: {
          include: {
            original_item: {
              include: {
                product: { select: { id: true, name: true, image_url: true } },
                variant: {
                  select: { id: true, size: true, color: true, sku: true },
                },
              },
            },
          },
        },
        voucher: {
          select: {
            id: true,
            code: true,
            original_value: true,
            balance: true,
            status: true,
            expires_at: true,
          },
        },
        processor: {
          select: { id: true, name: true },
        },
      },
    });

    if (!exchange) {
      return NextResponse.json(
        { error: "Troca nao encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...exchange,
      total_returned: Number(exchange.total_returned),
      credit_generated: exchange.credit_generated
        ? Number(exchange.credit_generated)
        : null,
      original_sale: {
        ...exchange.original_sale,
        total_amount: Number(exchange.original_sale.total_amount),
      },
      items: exchange.items.map((item) => ({
        ...item,
        unit_price: Number(item.unit_price),
        original_item: {
          ...item.original_item,
          unit_price: Number(item.original_item.unit_price),
        },
      })),
      voucher: exchange.voucher
        ? {
            ...exchange.voucher,
            original_value: Number(exchange.voucher.original_value),
            balance: Number(exchange.voucher.balance),
          }
        : null,
    });
  } catch (error) {
    console.error("[Exchange] Error fetching:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar troca." },
      { status: 500 }
    );
  }
}
