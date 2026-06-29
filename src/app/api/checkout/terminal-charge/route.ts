import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { terminalChargeSchema } from "@/lib/validations/terminal";
import { getNumericSetting } from "@/lib/settings";
import { validateInstallments } from "@/lib/mercadopago/amount";
import { createTerminalOrder } from "@/lib/mercadopago/orders";
import { mapMpErrorToOperatorMessage } from "@/lib/mercadopago/errors";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const parsed = terminalChargeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados da cobrança inválidos" }, { status: 400 });
  }
  const { terminalId, method, installments, totalAmount, items, customerId } = parsed.data;

  const terminal = await prisma.paymentTerminal.findUnique({ where: { id: terminalId } });
  if (!terminal || !terminal.is_active) {
    return NextResponse.json({ error: "Maquininha não encontrada ou inativa" }, { status: 404 });
  }

  if (method === "CREDIT") {
    const max = Math.round(await getNumericSetting("max_installments")) || 1;
    const check = validateInstallments(totalAmount, installments, max);
    if (!check.ok) {
      const msg =
        check.reason === "MIN_PARCELA"
          ? "Cada parcela deve ser de no mínimo R$5,00."
          : `Máximo de ${max}x permitido.`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // One active charge per terminal
  const active = await prisma.terminalCharge.findFirst({
    where: { terminal_id: terminalId, status: { in: ["CREATED", "SENT", "PROCESSING"] } },
  });
  if (active) {
    return NextResponse.json(
      { error: "Maquininha ocupada — cancele a cobrança anterior.", code: "DEVICE_BUSY" },
      { status: 409 }
    );
  }

  // Create the pending sale
  const sale = await prisma.sale.create({
    data: {
      total_amount: totalAmount,
      payment_method: method === "PIX" ? "PIX" : "CARD",
      status: "PENDING",
      customer_id: customerId,
      items: {
        create: items.map((i) => ({
          product_id: i.productId,
          variant_id: i.variantId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
        })),
      },
    },
  });

  // Reserve the charge row; mp_order_id filled after order creation
  const charge = await prisma.terminalCharge.create({
    data: {
      sale_id: sale.id,
      terminal_id: terminalId,
      mp_order_id: `pending_${sale.id}`,
      amount: totalAmount,
      method,
      installments: method === "CREDIT" ? installments : 1,
      status: "CREATED",
    },
  });

  try {
    const order = await createTerminalOrder({
      terminalDeviceId: terminal.mp_device_id,
      amount: totalAmount,
      method,
      installments,
      externalRef: charge.id,
    });
    const updated = await prisma.terminalCharge.update({
      where: { id: charge.id },
      data: { mp_order_id: order.id, status: "SENT" },
    });
    return NextResponse.json({ chargeId: updated.id, status: updated.status });
  } catch (err) {
    await prisma.terminalCharge.update({
      where: { id: charge.id },
      data: { status: "ERROR", error_code: "CREATE_FAILED" },
    });
    await prisma.sale.delete({ where: { id: sale.id } });
    const op = mapMpErrorToOperatorMessage(err);
    return NextResponse.json({ error: op.message, code: op.code }, { status: 502 });
  }
}
