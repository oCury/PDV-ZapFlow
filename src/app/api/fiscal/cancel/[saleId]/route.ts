import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cancelNfceSchema } from "@/lib/validations/fiscal";
import { FiscalService } from "@/lib/fiscal/FiscalService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ saleId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { saleId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = cancelNfceSchema.safeParse({ ...body as object, saleId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { reason } = parsed.data;

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        nfce_status: true,
        nfce_access_key: true,
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venda não encontrada." },
        { status: 404 }
      );
    }

    if (!sale.nfce_access_key) {
      return NextResponse.json(
        {
          error:
            "NFC-e não possui chave de acesso. Não é possível cancelar.",
        },
        { status: 400 }
      );
    }

    const result = await FiscalService.cancel(sale.nfce_access_key, reason);

    if (result.status === "erro") {
      await FiscalService.logEvent(saleId, "cancel_error", {
        reason,
        errors: result.errors,
      });
      return NextResponse.json(
        { error: "Erro ao cancelar NFC-e.", details: result.errors },
        { status: 502 }
      );
    }

    await prisma.sale.update({
      where: { id: saleId },
      data: { nfce_status: "cancelled" },
    });

    await FiscalService.logEvent(saleId, "cancelled", { reason });

    return NextResponse.json({ status: "cancelled" });
  } catch (error) {
    console.error("[Fiscal] Error cancelling NFC-e:", error);
    return NextResponse.json(
      { error: "Erro interno ao cancelar NFC-e." },
      { status: 500 }
    );
  }
}
