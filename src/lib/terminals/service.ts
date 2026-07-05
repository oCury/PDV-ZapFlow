import { prisma } from "@/lib/prisma";
import { getNumericSetting } from "@/lib/settings";
import { validateInstallments } from "@/lib/mercadopago/amount";
import { loadConnection } from "./connections";
import { resolveDriver } from "./registry";
import { finalizeTerminalCharge } from "./finalize";
import type { DriverResult, OperatorError } from "./types";
import type { TerminalChargeMethod } from "@prisma/client";

const CONFIG = (message: string): { ok: false; error: OperatorError } => ({
  ok: false,
  error: { code: "CONFIG", message },
});
const BUSY = (): { ok: false; error: OperatorError } => ({
  ok: false,
  error: { code: "DEVICE_BUSY", message: "Maquininha ocupada — cancele a cobrança anterior." },
});

export interface InitiateInput {
  terminalId: string;
  method: TerminalChargeMethod;
  installments: number;
  totalAmount: number;
  items: { productId: string; variantId?: string; quantity: number; unitPrice: number }[];
  customerId?: string;
}

export async function initiateCharge(
  input: InitiateInput
): Promise<DriverResult<{ chargeId: string; status: "SENT" }>> {
  const terminal = await prisma.paymentTerminal.findFirst({
    where: { id: input.terminalId, is_active: true },
  });
  if (!terminal) return CONFIG("Maquininha não encontrada.");

  const conn = await loadConnection(terminal.provider);
  if (!conn || conn.status === "disconnected") return CONFIG(`Provedor ${terminal.provider} não conectado.`);

  const driver = resolveDriver(conn);
  if (!driver.capabilities.methods.includes(input.method)) {
    return CONFIG(`Método ${input.method} não suportado por ${terminal.provider}.`);
  }
  if (input.installments > 1 && !driver.capabilities.installments) {
    return CONFIG("Parcelamento não suportado.");
  }

  if (input.method === "CREDIT") {
    const max = Math.round(await getNumericSetting("max_installments")) || 1;
    const check = validateInstallments(input.totalAmount, input.installments, max);
    if (!check.ok) {
      return CONFIG(
        check.reason === "MIN_PARCELA"
          ? "Parcela mínima de R$5,00."
          : `Máximo de ${max}x permitido.`
      );
    }
  }

  const active = await prisma.terminalCharge.findFirst({
    where: { terminal_id: terminal.id, status: { in: ["CREATED", "SENT", "PROCESSING"] } },
  });
  if (active) return BUSY();

  const installments = input.method === "CREDIT" ? input.installments : 1;

  // Create the pending sale — total_amount is required by the schema
  const sale = await prisma.sale.create({
    data: {
      total_amount: input.totalAmount,
      status: "PENDING",
      payment_method: input.method === "PIX" ? "PIX" : "CARD",
      customer_id: input.customerId,
      items: {
        create: input.items.map((i) => ({
          product_id: i.productId,
          variant_id: i.variantId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
        })),
      },
    },
  });

  // Reserve the charge row; external_order_id filled after provider call
  const charge = await prisma.terminalCharge.create({
    data: {
      sale_id: sale.id,
      terminal_id: terminal.id,
      provider: terminal.provider,
      mp_order_id: `pending_${sale.id}`,
      external_order_id: null,
      amount: input.totalAmount,
      method: input.method,
      installments,
      status: "CREATED",
    },
  });

  const deviceId = terminal.device_external_id ?? terminal.mp_device_id;
  const created = await driver.createCharge(conn.credentials, {
    deviceExternalId: deviceId,
    amount: input.totalAmount,
    method: input.method,
    installments,
    externalRef: charge.id,
  });

  if (!created.ok) {
    await prisma.terminalCharge.update({
      where: { id: charge.id },
      data: { status: "ERROR", error_code: created.error.code },
    });
    await prisma.sale.delete({ where: { id: sale.id } });
    return created;
  }

  await prisma.terminalCharge.update({
    where: { id: charge.id },
    data: {
      external_order_id: created.data.externalOrderId,
      mp_order_id: created.data.externalOrderId,
      status: "SENT",
    },
  });
  return { ok: true, data: { chargeId: charge.id, status: "SENT" } };
}

export async function pollCharge(
  chargeId: string
): Promise<{ status: string; approved: boolean; saleId: string | null }> {
  const charge = await prisma.terminalCharge.findUnique({ where: { id: chargeId } });
  if (!charge) throw new Error("charge not found");

  const pending = ["CREATED", "SENT", "PROCESSING"].includes(charge.status);
  if (pending && charge.external_order_id && !charge.external_order_id.startsWith("pending_")) {
    const conn = await loadConnection(charge.provider);
    if (conn) {
      const driver = resolveDriver(conn);
      const res = await driver.getChargeStatus(conn.credentials, charge.external_order_id);
      if (res.ok) {
        await finalizeTerminalCharge({
          provider: charge.provider,
          externalOrderId: charge.external_order_id,
          status: res.data.status,
          externalPaymentId: res.data.externalPaymentId,
          cardBrand: res.data.cardBrand,
        }).catch(() => {});
      }
    }
  }

  const fresh = await prisma.terminalCharge.findUnique({ where: { id: chargeId } });
  return {
    status: fresh!.status,
    approved: fresh!.status === "APPROVED",
    saleId: fresh!.sale_id,
  };
}

export async function cancelCharge(chargeId: string): Promise<{ status: "CANCELED" }> {
  const charge = await prisma.terminalCharge.findUnique({ where: { id: chargeId } });
  if (charge?.external_order_id && !charge.external_order_id.startsWith("pending_")) {
    const conn = await loadConnection(charge.provider);
    if (conn) {
      await resolveDriver(conn)
        .cancelCharge(conn.credentials, charge.external_order_id)
        .catch(() => {});
    }
  }
  await prisma.terminalCharge.update({
    where: { id: chargeId },
    data: { status: "CANCELED", resolved_at: new Date() },
  });
  if (charge?.sale_id) {
    // "CANCELLED" matches the value used in the existing cancel route
    await prisma.sale.update({ where: { id: charge.sale_id }, data: { status: "CANCELLED" } });
  }
  return { status: "CANCELED" };
}
