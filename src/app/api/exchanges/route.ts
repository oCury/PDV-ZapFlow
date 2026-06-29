import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createExchangeSchema } from "@/lib/validations/exchanges";
import { processExchange } from "@/lib/exchanges/process";
import { requireEntitlement } from "@/lib/entitlements-guard";

// ─── GET: List exchanges ────────────────────────────────────────────────────

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("vouchers");
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: Prisma.ExchangeWhereInput = {};

  if (status) {
    where.status = status as Prisma.EnumExchangeStatusFilter;
  }

  if (startDate || endDate) {
    where.created_at = {};
    if (startDate) {
      where.created_at.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.created_at.lte = end;
    }
  }

  try {
    const exchanges = await prisma.exchange.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        original_sale: {
          select: {
            id: true,
            total_amount: true,
            created_at: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
        items: {
          include: {
            original_item: {
              include: {
                product: { select: { name: true } },
                variant: { select: { size: true, color: true, sku: true } },
              },
            },
          },
        },
        voucher: {
          select: { id: true, code: true, balance: true, status: true },
        },
      },
    });

    const result = exchanges.map((ex) => ({
      ...ex,
      total_returned: Number(ex.total_returned),
      credit_generated: ex.credit_generated ? Number(ex.credit_generated) : null,
      original_sale: {
        ...ex.original_sale,
        total_amount: Number(ex.original_sale.total_amount),
      },
      items: ex.items.map((item) => ({
        ...item,
        unit_price: Number(item.unit_price),
        original_item: {
          ...item.original_item,
          unit_price: Number(item.original_item.unit_price),
        },
      })),
      voucher: ex.voucher
        ? { ...ex.voucher, balance: Number(ex.voucher.balance) }
        : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Exchanges] Error listing:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar trocas." },
      { status: 500 }
    );
  }
}

// ─── POST: Create & process exchange ────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("vouchers");
  if (gate) return gate;

  try {
    const body = await req.json();
    const parsed = createExchangeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados invalidos" },
        { status: 400 }
      );
    }

    const { originalSaleId, reason, reasonDetail, refundMethod, items } =
      parsed.data;

    // Verify sale exists
    const sale = await prisma.sale.findUnique({
      where: { id: originalSaleId },
      include: {
        items: true,
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venda original nao encontrada." },
        { status: 404 }
      );
    }

    // Validate all item IDs belong to the sale
    const saleItemIds = new Set(sale.items.map((si) => si.id));
    for (const item of items) {
      if (!saleItemIds.has(item.originalItemId)) {
        return NextResponse.json(
          { error: `Item ${item.originalItemId} nao pertence a esta venda.` },
          { status: 400 }
        );
      }
    }

    // Build unit_price map from sale items
    const priceMap = new Map(
      sale.items.map((si) => [si.id, Number(si.unit_price)])
    );

    // Create exchange and process in one transaction
    const exchange = await prisma.exchange.create({
      data: {
        original_sale_id: originalSaleId,
        status: "PENDING",
        reason,
        reason_detail: reasonDetail ?? null,
        refund_method: refundMethod,
        total_returned: 0,
        processed_by: session.userId,
        items: {
          create: items.map((item) => ({
            original_item_id: item.originalItemId,
            action: item.action,
            quantity: item.quantity,
            unit_price: priceMap.get(item.originalItemId) ?? 0,
          })),
        },
      },
    });

    // Process immediately (loja pequena, sem workflow de aprovacao)
    const processed = await processExchange(exchange.id);

    return NextResponse.json(
      {
        ...processed,
        total_returned: Number(processed.total_returned),
        credit_generated: processed.credit_generated
          ? Number(processed.credit_generated)
          : null,
        items: processed.items.map((item) => ({
          ...item,
          unit_price: Number(item.unit_price),
          original_item: {
            ...item.original_item,
            unit_price: Number(item.original_item.unit_price),
          },
        })),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro interno ao criar troca.";
    const isValidation =
      message.includes("Quantidade excede") ||
      message.includes("Prazo de troca") ||
      message.includes("nao encontrada") ||
      message.includes("ja foi processada");

    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500 }
    );
  }
}
