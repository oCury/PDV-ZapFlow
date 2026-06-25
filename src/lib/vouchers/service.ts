import { prisma } from "@/lib/prisma";
import type { Voucher, VoucherUsage } from "@prisma/client";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_SEGMENT_LENGTH = 4;

/**
 * Generates a voucher code in the format "VT-XXXX-XXXX"
 * where X is alphanumeric uppercase (A-Z, 0-9).
 */
export function generateVoucherCode(): string {
  const segment = () =>
    Array.from({ length: CODE_SEGMENT_LENGTH }, () =>
      CHARSET[Math.floor(Math.random() * CHARSET.length)]
    ).join("");

  return `VT-${segment()}-${segment()}`;
}

const DEFAULT_EXPIRY_DAYS = 90;

interface CreateVoucherInput {
  type: "EXCHANGE" | "GIFT";
  originalValue: number;
  customerId?: string;
  expiresInDays?: number;
}

/**
 * Creates a new voucher with a unique code.
 * Retries on code collision (up to 5 attempts).
 */
export async function createVoucher(
  data: CreateVoucherInput
): Promise<Voucher> {
  const expiresInDays = data.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = generateVoucherCode();

    try {
      const voucher = await prisma.voucher.create({
        data: {
          code,
          type: data.type,
          original_value: data.originalValue,
          balance: data.originalValue,
          status: "ACTIVE",
          customer_id: data.customerId ?? null,
          expires_at: expiresAt,
        },
      });

      return voucher;
    } catch (error: unknown) {
      // Prisma unique constraint violation code
      const isPrismaUniqueError =
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2002";

      if (isPrismaUniqueError && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Não foi possível gerar um código único para o vale.");
}

interface RedeemResult {
  voucher: Voucher;
  usage: VoucherUsage;
}

/**
 * Redeems a voucher by debiting the given amount and creating a usage record.
 * Sets status to USED when balance reaches zero.
 */
export async function redeemVoucher(
  code: string,
  amount: number,
  saleId: string
): Promise<RedeemResult> {
  return prisma.$transaction(async (tx) => {
    const voucher = await tx.voucher.findFirst({
      where: { code },
    });

    if (!voucher) {
      throw new Error("Vale não encontrado.");
    }

    if (voucher.status !== "ACTIVE") {
      throw new Error(`Vale não está ativo. Status atual: ${voucher.status}`);
    }

    if (voucher.expires_at < new Date()) {
      // Auto-expire
      await tx.voucher.update({
        where: { id: voucher.id },
        data: { status: "EXPIRED" },
      });
      throw new Error("Vale expirado.");
    }

    const currentBalance = Number(voucher.balance);
    if (currentBalance < amount) {
      throw new Error(
        `Saldo insuficiente. Saldo: R$ ${currentBalance.toFixed(2)}, solicitado: R$ ${amount.toFixed(2)}`
      );
    }

    const newBalance = currentBalance - amount;
    const newStatus = newBalance <= 0.001 ? "USED" : "ACTIVE";

    const updatedVoucher = await tx.voucher.update({
      where: { id: voucher.id },
      data: {
        balance: newBalance,
        status: newStatus,
      },
    });

    const usage = await tx.voucherUsage.create({
      data: {
        voucher_id: voucher.id,
        sale_id: saleId,
        amount,
      },
    });

    return { voucher: updatedVoucher, usage };
  });
}

/**
 * Cancels a voucher by setting its status to CANCELLED.
 */
export async function cancelVoucher(code: string): Promise<Voucher> {
  const voucher = await prisma.voucher.findFirst({
    where: { code },
  });

  if (!voucher) {
    throw new Error("Vale não encontrado.");
  }

  if (voucher.status === "CANCELLED") {
    throw new Error("Vale já está cancelado.");
  }

  if (voucher.status === "USED") {
    throw new Error("Não é possível cancelar um vale já utilizado.");
  }

  return prisma.voucher.update({
    where: { id: voucher.id },
    data: { status: "CANCELLED" },
  });
}

/**
 * Expires all active vouchers whose expires_at is in the past.
 * Returns the count of expired vouchers.
 */
export async function expireVouchers(): Promise<number> {
  const result = await prisma.voucher.updateMany({
    where: {
      status: "ACTIVE",
      expires_at: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });

  return result.count;
}

/**
 * Fetches a voucher by code, including its usages.
 */
export async function getVoucherByCode(
  code: string
): Promise<(Voucher & { usages: VoucherUsage[] }) | null> {
  return prisma.voucher.findFirst({
    where: { code },
    include: {
      usages: {
        orderBy: { created_at: "desc" },
      },
    },
  });
}
