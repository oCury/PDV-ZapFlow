import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

// ─── Voucher Code Generator ────────────────────────────────────────────────

const VOUCHER_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateVoucherCode(): string {
  const block = (len: number) =>
    Array.from({ length: len }, () =>
      VOUCHER_CODE_CHARS.charAt(
        Math.floor(Math.random() * VOUCHER_CODE_CHARS.length)
      )
    ).join("");
  return `VT-${block(4)}-${block(4)}`;
}

// ─── Get Exchangeable Items ─────────────────────────────────────────────────

interface ExchangeableItem {
  saleItemId: string;
  productId: string;
  productName: string;
  variantId: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
  alreadyExchanged: number;
  availableQuantity: number;
}

export async function getExchangeableItems(
  saleId: string
): Promise<ExchangeableItem[]> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
          variant: { select: { id: true, size: true, color: true } },
        },
      },
    },
  });

  if (!sale) {
    throw new Error("Venda nao encontrada.");
  }

  // Check exchange deadline
  const deadlineDaysStr = await getSetting("exchange_deadline_days");
  const deadlineDays = deadlineDaysStr
    ? parseInt(deadlineDaysStr, 10)
    : 30;
  const deadline = new Date(sale.created_at);
  deadline.setDate(deadline.getDate() + (isNaN(deadlineDays) ? 30 : deadlineDays));

  if (new Date() > deadline) {
    throw new Error(
      `Prazo de troca expirado. A venda foi realizada em ${sale.created_at.toLocaleDateString("pt-BR")} e o prazo era de ${deadlineDays} dias.`
    );
  }

  // Fetch all exchange items for this sale's items (excluding cancelled exchanges)
  const exchangedQuantities = await prisma.exchangeItem.groupBy({
    by: ["original_item_id"],
    where: {
      original_item: { sale_id: saleId },
      exchange: { status: { not: "CANCELLED" } },
    },
    _sum: { quantity: true },
  });

  const exchangedMap = new Map(
    exchangedQuantities.map((eq) => [
      eq.original_item_id,
      eq._sum.quantity ?? 0,
    ])
  );

  return sale.items.map((item) => {
    const alreadyExchanged = exchangedMap.get(item.id) ?? 0;
    return {
      saleItemId: item.id,
      productId: item.product_id,
      productName: item.product.name,
      variantId: item.variant_id,
      size: item.size,
      color: item.color,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      alreadyExchanged,
      availableQuantity: item.quantity - alreadyExchanged,
    };
  });
}

// ─── Process Exchange ───────────────────────────────────────────────────────

export async function processExchange(exchangeId: string) {
  return prisma.$transaction(async (tx) => {
    const exchange = await tx.exchange.findUnique({
      where: { id: exchangeId },
      include: {
        items: {
          include: {
            original_item: {
              include: {
                product: true,
                variant: true,
              },
            },
          },
        },
        original_sale: {
          include: { customer: true },
        },
      },
    });

    if (!exchange) {
      throw new Error("Troca nao encontrada.");
    }

    if (exchange.status === "COMPLETED") {
      throw new Error("Esta troca ja foi processada.");
    }

    if (exchange.status === "CANCELLED") {
      throw new Error("Esta troca foi cancelada.");
    }

    // Validate quantities and restore stock
    let totalReturned = 0;

    for (const exchangeItem of exchange.items) {
      const originalItem = exchangeItem.original_item;

      // Check already exchanged quantity (excluding cancelled and current)
      const alreadyExchanged = await tx.exchangeItem.aggregate({
        where: {
          original_item_id: exchangeItem.original_item_id,
          exchange: {
            status: { not: "CANCELLED" },
            id: { not: exchangeId },
          },
        },
        _sum: { quantity: true },
      });

      const previouslyExchanged = alreadyExchanged._sum.quantity ?? 0;
      const maxAllowed = originalItem.quantity - previouslyExchanged;

      if (exchangeItem.quantity > maxAllowed) {
        throw new Error(
          `Quantidade excede o disponivel para o item "${originalItem.product.name}". Maximo: ${maxAllowed}, solicitado: ${exchangeItem.quantity}`
        );
      }

      // Restore stock
      if (originalItem.variant_id && originalItem.variant) {
        await tx.productVariant.update({
          where: { id: originalItem.variant_id },
          data: { stock_quantity: { increment: exchangeItem.quantity } },
        });
      } else {
        await tx.product.update({
          where: { id: originalItem.product_id },
          data: { stock_quantity: { increment: exchangeItem.quantity } },
        });
      }

      totalReturned += exchangeItem.quantity * Number(exchangeItem.unit_price);
    }

    // Generate voucher if refund method is VOUCHER
    let voucherId: string | null = null;

    if (exchange.refund_method === "VOUCHER") {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      // Generate unique code with retry
      let code = generateVoucherCode();
      let attempts = 0;
      while (attempts < 5) {
        const existing = await tx.voucher.findUnique({ where: { code } });
        if (!existing) break;
        code = generateVoucherCode();
        attempts++;
      }

      const voucher = await tx.voucher.create({
        data: {
          code,
          type: "EXCHANGE",
          original_value: totalReturned,
          balance: totalReturned,
          status: "ACTIVE",
          customer_id: exchange.original_sale.customer_id,
          expires_at: expiresAt,
        },
      });

      voucherId = voucher.id;
    }

    // Update exchange
    const updated = await tx.exchange.update({
      where: { id: exchangeId },
      data: {
        status: "COMPLETED",
        total_returned: totalReturned,
        credit_generated: exchange.refund_method === "VOUCHER" ? totalReturned : null,
        voucher_id: voucherId,
      },
      include: {
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
        original_sale: true,
        voucher: true,
      },
    });

    return updated;
  });
}
