/**
 * Customer Follow-up Service
 * 
 * Handles automatic customer retention by sending WhatsApp messages
 * with cashback rewards 15 days after purchase.
 */

import { prisma } from "@/lib/prisma";
import evolutionAPI from "@/lib/whatsapp/evolution-api";

const FOLLOWUP_DAYS = 15;
const CASHBACK_PERCENT = 0.10; // 10%
const FOLLOWUP_TYPE = "15_DAY_CASHBACK";

export interface FollowupResult {
  customerId: string;
  customerName: string | null;
  saleId: string;
  saleAmount: number;
  cashbackAmount: number;
  pointsAdded: number;
  whatsappStatus: "SENT" | "FAILED" | "SKIPPED";
  error?: string;
}

export interface FollowupSummary {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  totalCashbackGiven: number;
  results: FollowupResult[];
}

/**
 * Get the WhatsApp number for a customer
 * Uses whatsapp field if available, otherwise uses phone
 */
function getWhatsAppNumber(customer: { whatsapp: string | null; phone: string }): string | null {
  if (customer.whatsapp && customer.whatsapp.length >= 10) {
    return customer.whatsapp;
  }
  if (customer.phone && customer.phone.length >= 10) {
    return customer.phone;
  }
  return null;
}

/**
 * Generate the follow-up message
 */
function generateMessage(
  customerName: string | null,
  cashbackAmount: number,
  storeName: string
): string {
  const name = customerName || "Cliente";
  const cashbackFormatted = cashbackAmount.toFixed(2);

  return `Olá ${name}! 👋

Faz 15 dias que você esteve conosco e queremos agradecer! 🙏

Como forma de agradecimento, acabamos de adicionar *R$ ${cashbackFormatted}* em créditos de fidelidade na sua conta. 🎁

Use na sua próxima visita!

Esperamos você de volta! 💚

- Equipe ${storeName}`;
}

/**
 * Find all sales eligible for follow-up
 * Sales from exactly N days ago with a customer who has phone/WhatsApp
 * and hasn't received a follow-up for that sale yet
 */
export async function findEligibleSales(daysAgo: number = FOLLOWUP_DAYS) {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - daysAgo);
  
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const allSales = await prisma.sale.findMany({
    where: {
      status: "APPROVED",
      created_at: {
        gte: startOfDay,
        lte: endOfDay,
      },
      customer_id: {
        not: null,
      },
      followup: {
        is: null,
      },
    },
    include: {
      customer: true,
    },
  });

  // Filter to only include customers with phone or whatsapp
  const eligibleSales = allSales.filter(
    (sale) => sale.customer && (sale.customer.whatsapp || sale.customer.phone)
  );

  return eligibleSales;
}

/**
 * Calculate cashback amount and points
 */
export function calculateCashback(saleAmount: number): { cashbackAmount: number; pointsToAdd: number } {
  const cashbackAmount = Number(saleAmount) * CASHBACK_PERCENT;
  const pointsToAdd = Math.floor(cashbackAmount);
  return { cashbackAmount, pointsToAdd };
}

/**
 * Process a single follow-up
 */
export async function processSingleFollowup(
  sale: {
    id: string;
    total_amount: unknown;
    customer: {
      id: string;
      name: string | null;
      phone: string;
      whatsapp: string | null;
      loyalty_points: number;
    };
  },
  storeName: string,
  dryRun: boolean = false
): Promise<FollowupResult> {
  const customer = sale.customer;
  const saleAmount = Number(sale.total_amount);
  const { cashbackAmount, pointsToAdd } = calculateCashback(saleAmount);

  const whatsappNumber = getWhatsAppNumber(customer);

  if (!whatsappNumber) {
    return {
      customerId: customer.id,
      customerName: customer.name,
      saleId: sale.id,
      saleAmount,
      cashbackAmount,
      pointsAdded: 0,
      whatsappStatus: "SKIPPED",
      error: "No valid WhatsApp number",
    };
  }

  if (dryRun) {
    return {
      customerId: customer.id,
      customerName: customer.name,
      saleId: sale.id,
      saleAmount,
      cashbackAmount,
      pointsAdded: pointsToAdd,
      whatsappStatus: "SKIPPED",
      error: "Dry run mode",
    };
  }

  const message = generateMessage(customer.name, cashbackAmount, storeName);

  let whatsappStatus: "SENT" | "FAILED" = "FAILED";
  let errorMessage: string | undefined;

  try {
    if (evolutionAPI.isConfigured()) {
      const result = await evolutionAPI.sendText({
        number: whatsappNumber,
        text: message,
      });

      if (result.success) {
        whatsappStatus = "SENT";
      } else {
        errorMessage = result.error;
      }
    } else {
      errorMessage = "Evolution API not configured";
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  // Add cashback points to customer (even if WhatsApp failed)
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      loyalty_points: { increment: pointsToAdd },
    },
  });

  // Record the follow-up
  await prisma.customerFollowup.create({
    data: {
      customer_id: customer.id,
      sale_id: sale.id,
      type: FOLLOWUP_TYPE,
      cashback_amount: cashbackAmount,
      points_added: pointsToAdd,
      whatsapp_status: whatsappStatus,
      message: whatsappStatus === "SENT" ? message : null,
    },
  });

  return {
    customerId: customer.id,
    customerName: customer.name,
    saleId: sale.id,
    saleAmount,
    cashbackAmount,
    pointsAdded: pointsToAdd,
    whatsappStatus,
    error: errorMessage,
  };
}

/**
 * Process all eligible follow-ups
 */
export async function processFollowups(
  daysAgo: number = FOLLOWUP_DAYS,
  dryRun: boolean = false
): Promise<FollowupSummary> {
  const storeName = process.env.STORE_NAME || "Nossa Loja";
  const eligibleSales = await findEligibleSales(daysAgo);

  const results: FollowupResult[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let totalCashbackGiven = 0;

  for (const sale of eligibleSales) {
    if (!sale.customer) continue;

    const result = await processSingleFollowup(
      {
        id: sale.id,
        total_amount: sale.total_amount,
        customer: sale.customer,
      },
      storeName,
      dryRun
    );

    results.push(result);

    switch (result.whatsappStatus) {
      case "SENT":
        sent++;
        totalCashbackGiven += result.cashbackAmount;
        break;
      case "FAILED":
        failed++;
        totalCashbackGiven += result.cashbackAmount;
        break;
      case "SKIPPED":
        skipped++;
        break;
    }
  }

  return {
    processed: results.length,
    sent,
    failed,
    skipped,
    totalCashbackGiven,
    results,
  };
}

/**
 * Get follow-up statistics
 */
export async function getFollowupStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, sentToday, totalCashback, pending] = await Promise.all([
    prisma.customerFollowup.count(),
    prisma.customerFollowup.count({
      where: {
        sent_at: { gte: today },
        whatsapp_status: "SENT",
      },
    }),
    prisma.customerFollowup.aggregate({
      _sum: { cashback_amount: true },
      where: { whatsapp_status: { in: ["SENT", "FAILED"] } },
    }),
    findEligibleSales(FOLLOWUP_DAYS),
  ]);

  return {
    totalSent: total,
    sentToday,
    totalCashbackGiven: Number(totalCashback._sum.cashback_amount || 0),
    pendingToday: pending.length,
  };
}

/**
 * Get recent follow-ups with customer and sale info
 */
export async function getRecentFollowups(limit: number = 50) {
  return prisma.customerFollowup.findMany({
    orderBy: { sent_at: "desc" },
    take: limit,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      sale: {
        select: {
          id: true,
          total_amount: true,
          created_at: true,
        },
      },
    },
  });
}
