import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitNfceSchema } from "@/lib/validations/fiscal";
import { FiscalService } from "@/lib/fiscal/FiscalService";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = emitNfceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { saleId, force } = parsed.data;

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                sell_price: true,
                ncm: true,
                cfop: true,
                fiscal_unit: true,
              },
            },
          },
        },
        payments: true,
        customer: true,
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venda não encontrada." },
        { status: 404 }
      );
    }

    if (sale.nfce_status && !force) {
      return NextResponse.json(
        {
          error: `NFC-e já possui status "${sale.nfce_status}". Use force=true para re-emitir.`,
        },
        { status: 409 }
      );
    }

    const saleData = {
      id: sale.id,
      total_amount: Number(sale.total_amount),
      loyalty_discount: sale.loyalty_discount
        ? Number(sale.loyalty_discount)
        : null,
      items: sale.items.map((item) => ({
        product: {
          id: item.product.id,
          name: item.product.name,
          barcode: item.product.barcode,
          sell_price: Number(item.product.sell_price),
          ncm: item.product.ncm,
          cfop: item.product.cfop,
          fiscal_unit: item.product.fiscal_unit,
        },
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
      })),
      payments: sale.payments.map((p) => ({
        payment_method: p.payment_method,
        amount: Number(p.amount),
      })),
      customer: sale.customer
        ? { cpf: sale.customer.cpf, name: sale.customer.name }
        : null,
    };

    const payload = FiscalService.buildNfcePayload(saleData);

    // Update status to pending before transmitting
    await prisma.sale.update({
      where: { id: saleId },
      data: { nfce_status: "pending", nfce_errors: null },
    });

    const result = await FiscalService.transmit(saleId, payload);

    if (result.status === "erro") {
      const isNetworkError = result.errors?.some(
        (e) => e.code === "NETWORK"
      );

      if (isNetworkError) {
        // Network failure — enqueue for retry (contingency)
        await FiscalService.enqueue(saleId, payload);
        await prisma.sale.update({
          where: { id: saleId },
          data: { nfce_status: "contingency" },
        });
        await FiscalService.logEvent(saleId, "contingency", {
          reason: "network_failure",
        });
        return NextResponse.json({
          status: "contingency",
          message:
            "Falha de comunicação. Nota enfileirada para reprocessamento.",
        });
      }

      // API returned an error
      await prisma.sale.update({
        where: { id: saleId },
        data: {
          nfce_status: "error",
          nfce_errors: JSON.stringify(result.errors),
        },
      });

      return NextResponse.json(
        { error: "Erro ao transmitir NFC-e.", details: result.errors },
        { status: 502 }
      );
    }

    // Success or processing
    const updateData: Record<string, unknown> = {
      nfce_status:
        result.status === "autorizado" ? "authorized" : "pending",
    };

    if (result.accessKey) updateData.nfce_access_key = result.accessKey;
    if (result.qrCodeUrl) updateData.nfce_qr_url = result.qrCodeUrl;
    if (result.danfeUrl) updateData.nfce_danfe_url = result.danfeUrl;
    if (result.protocol) updateData.nfce_protocol = result.protocol;

    await prisma.sale.update({
      where: { id: saleId },
      data: updateData,
    });

    return NextResponse.json({
      status: updateData.nfce_status,
      accessKey: result.accessKey ?? null,
      number: sale.nfce_number ?? null,
    });
  } catch (error) {
    console.error("[Fiscal] Error emitting NFC-e:", error);
    return NextResponse.json(
      { error: "Erro interno ao emitir NFC-e." },
      { status: 500 }
    );
  }
}
