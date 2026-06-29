import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { resolveTenantId } from "@/lib/tenant/resolve-tenant";
import { createSaleSchema } from "@/lib/validations/pos";
import { redeemVoucher, getVoucherByCode } from "@/lib/vouchers/service";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const hasNfce = searchParams.get("has_nfce") === "true";
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const where: Prisma.SaleWhereInput = {};

  if (hasNfce) {
    where.nfce_status = { not: null };
  }

  try {
    const sales = await prisma.sale.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: Math.min(limit, 200),
      select: {
        id: true,
        total_amount: true,
        nfce_status: true,
        nfce_number: true,
        nfce_series: true,
        nfce_access_key: true,
        nfce_qr_url: true,
        nfce_danfe_url: true,
        nfce_protocol: true,
        nfce_errors: true,
        created_at: true,
      },
    });

    return NextResponse.json(
      sales.map((s) => ({
        ...s,
        total_amount: Number(s.total_amount),
      }))
    );
  } catch (error) {
    console.error("[Sales] Error listing sales:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar vendas." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const parsed = createSaleSchema.safeParse({
      totalAmount: body.totalAmount,
      items: body.items,
      payments: body.payments,
      paymentMethod: body.paymentMethod,
      customerId: body.customerId,
      customerPhone: body.customerPhone,
      tableId: body.tableId,
      loyaltyDiscount: body.loyaltyDiscount,
      notes: body.notes,
      shippingCost: body.shippingCost,
      shippingMethod: body.shippingMethod,
      shippingAddress: body.shippingAddress,
      shippingCep: body.shippingCep,
      channel: body.channel,
      sellerId: body.sellerId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const {
      totalAmount,
      items,
      payments,
      paymentMethod,
      customerId,
      tableId,
      loyaltyDiscount,
      notes,
      shippingCost,
      shippingMethod,
      shippingAddress,
      shippingCep,
      channel,
      sellerId,
    } = parsed.data;

    const primaryMethod =
      payments?.length ? payments[0].paymentMethod : (paymentMethod ?? "CASH");

    const paymentList =
      (payments?.length ?? 0) > 0
        ? payments!
        : [{ paymentMethod: primaryMethod, amount: totalAmount }];

    // ── Voucher pre-validation (F3) ──────────────────────────────────────────
    const voucherPayments = paymentList.filter(
      (p) => p.paymentMethod === "VOUCHER" && "voucherCode" in p
    ) as Array<{ paymentMethod: string; amount: number; voucherCode: string }>;

    for (const vp of voucherPayments) {
      const voucher = await getVoucherByCode(vp.voucherCode);
      if (!voucher) {
        return NextResponse.json(
          { error: `Vale não encontrado: ${vp.voucherCode}` },
          { status: 400 }
        );
      }
      if (voucher.status !== "ACTIVE") {
        return NextResponse.json(
          { error: `Vale ${vp.voucherCode} não está ativo. Status: ${voucher.status}` },
          { status: 400 }
        );
      }
      if (voucher.expires_at < new Date()) {
        return NextResponse.json(
          { error: `Vale ${vp.voucherCode} expirado.` },
          { status: 400 }
        );
      }
      const balance = Number(voucher.balance);
      if (balance < vp.amount) {
        return NextResponse.json(
          { error: `Saldo insuficiente no vale ${vp.voucherCode}. Saldo: R$ ${balance.toFixed(2)}` },
          { status: 400 }
        );
      }
    }

    // ── Loyalty points redemption (M3) ─────────────────────────────────────
    let loyaltyPointsUsed = 0;
    if (loyaltyDiscount && loyaltyDiscount > 0 && customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { loyalty_points: true },
      });
      loyaltyPointsUsed = Math.min(
        customer?.loyalty_points ?? 0,
        Math.ceil(loyaltyDiscount)
      );
    }

    // ── Pre-fetch stock data in batch (avoid N+1 inside transaction) ──────
    const variantIds = items.filter((i) => i.variantId).map((i) => i.variantId!);
    const productOnlyIds = items.filter((i) => !i.variantId).map((i) => i.productId);

    const [variantsData, productsData] = await Promise.all([
      variantIds.length > 0
        ? prisma.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, sku: true, stock_quantity: true, product: { select: { name: true } } },
          })
        : Promise.resolve([]),
      productOnlyIds.length > 0
        ? prisma.product.findMany({
            where: { id: { in: productOnlyIds } },
            select: { id: true, name: true, stock_quantity: true, has_variants: true },
          })
        : Promise.resolve([]),
    ]);

    const variantMap = new Map(variantsData.map((v) => [v.id, v]));
    const productMap = new Map(productsData.map((p) => [p.id, p]));

    // ── Validate stock before entering transaction ──────────────────────────
    for (const item of items) {
      if (item.variantId) {
        const variant = variantMap.get(item.variantId);
        if (!variant) throw new Error(`Variante não encontrada: ${item.variantId}`);
        if (variant.stock_quantity < item.quantity) {
          throw new Error(
            `Estoque insuficiente para "${variant.product.name}" (SKU: ${variant.sku}). Disponível: ${variant.stock_quantity}, solicitado: ${item.quantity}`
          );
        }
      } else {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Produto não encontrado: ${item.productId}`);
        if (product.has_variants) {
          throw new Error(`Produto "${product.name}" possui variantes. Selecione tamanho/cor para continuar.`);
        }
        if (product.stock_quantity < item.quantity) {
          throw new Error(
            `Estoque insuficiente para "${product.name}". Disponível: ${product.stock_quantity}, solicitado: ${item.quantity}`
          );
        }
      }
    }

    const sale = await prisma.$transaction(async (tx) => {
      // ── Stock decrement (validated above) ─────────────────────────────────
      for (const item of items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock_quantity: { decrement: item.quantity } },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock_quantity: { decrement: item.quantity } },
          });
        }
      }

      // ── Create Sale ───────────────────────────────────────────────────────
      const newSale = await tx.sale.create({
        data: {
          total_amount: totalAmount,
          payment_method: primaryMethod,
          status: "APPROVED",
          customer_id: customerId ?? null,
          table_id: tableId ?? null,
          seller_id: sellerId ?? null,
          loyalty_discount: loyaltyDiscount ?? null,
          notes: notes ?? null,
          shipping_cost: shippingCost ?? null,
          shipping_method: shippingMethod ?? null,
          shipping_address: shippingAddress ?? null,
          shipping_cep: shippingCep ?? null,
          channel: channel ?? "PDV",
          items: {
            create: items.map((item) => ({
              product_id: item.productId,
              variant_id: item.variantId ?? null,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              size: item.size ?? null,
              color: item.color ?? null,
            })),
          },
        },
        include: { items: true },
      });

      if (paymentList.length > 0) {
        await tx.salePayment.createMany({
          data: paymentList.map((p) => ({
            sale_id: newSale.id,
            payment_method: p.paymentMethod,
            amount: p.amount,
          })),
        });
      }

      // ── Loyalty points: deduct used, add earned (M3) ───────────────────
      if (customerId) {
        const pointsEarned = Math.floor(totalAmount);

        await tx.customer.update({
          where: { id: customerId },
          data: {
            loyalty_points: {
              increment: pointsEarned - loyaltyPointsUsed,
            },
          },
        });
      }

      // ── Release table if occupied (M5) ────────────────────────────────────
      if (tableId) {
        await tx.table.update({
          where: { id: tableId },
          data: { status: "AVAILABLE" },
        });
      }

      return newSale;
    });

    // ── Voucher redemption (F3) ────────────────────────────────────────────
    for (const vp of voucherPayments) {
      await redeemVoucher(vp.voucherCode, vp.amount, sale.id);
    }

    // ── M2: Check which items hit their min_stock threshold ───────────────
    const tenantId = await resolveTenantId();
    const alertProductIds = items.filter((i) => !i.variantId).map((i) => i.productId);
    const alertVariantIds = items.filter((i) => i.variantId).map((i) => i.variantId!);

    const stockAlerts: { id: string; name: string; sku?: string; stock_quantity: number; min_stock: number }[] = [];

    if (alertProductIds.length > 0) {
      const productAlerts = await prisma.$queryRaw<
        { id: string; name: string; stock_quantity: number; min_stock: number }[]
      >`
        SELECT id, name, stock_quantity, min_stock
        FROM   products
        WHERE  id = ANY(${alertProductIds}::text[])
          AND  min_stock > 0
          AND  stock_quantity <= min_stock
          AND  tenant_id = ${tenantId}
      `;
      stockAlerts.push(...productAlerts.map((p) => ({
        id: p.id,
        name: p.name,
        stock_quantity: Number(p.stock_quantity),
        min_stock: Number(p.min_stock),
      })));
    }

    if (alertVariantIds.length > 0) {
      const variantAlerts = await prisma.$queryRaw<
        { id: string; sku: string; stock_quantity: number; min_stock: number; product_name: string }[]
      >`
        SELECT pv.id, pv.sku, pv.stock_quantity, pv.min_stock, p.name as product_name
        FROM   product_variants pv
        JOIN   products p ON p.id = pv.product_id
        WHERE  pv.id = ANY(${alertVariantIds}::text[])
          AND  pv.min_stock > 0
          AND  pv.stock_quantity <= pv.min_stock
          AND  pv.tenant_id = ${tenantId}
      `;
      stockAlerts.push(...variantAlerts.map((v) => ({
        id: v.id,
        name: v.product_name,
        sku: v.sku,
        stock_quantity: Number(v.stock_quantity),
        min_stock: Number(v.min_stock),
      })));
    }

    return NextResponse.json(
      {
        id: sale.id,
        status: sale.status,
        total_amount: Number(sale.total_amount),
        items: sale.items.length,
        shipping_cost: sale.shipping_cost ? Number(sale.shipping_cost) : null,
        stockAlerts,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro interno ao processar venda.";
    const isValidationError =
      message.includes("Estoque insuficiente") ||
      message.includes("Produto não encontrado") ||
      message.includes("Variante não encontrada") ||
      message.includes("possui variantes") ||
      message.includes("Vale não encontrado") ||
      message.includes("não está ativo") ||
      message.includes("Vale expirado") ||
      message.includes("Saldo insuficiente");

    return NextResponse.json(
      { error: message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
