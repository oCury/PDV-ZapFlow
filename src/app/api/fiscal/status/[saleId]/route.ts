import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { FiscalService } from "@/lib/fiscal/FiscalService";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ saleId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { saleId } = await params;

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        nfce_status: true,
        nfce_number: true,
        nfce_series: true,
        nfce_access_key: true,
        nfce_qr_url: true,
        nfce_danfe_url: true,
        nfce_protocol: true,
        nfce_errors: true,
        total_amount: true,
        created_at: true,
      },
    });

    if (!sale) {
      return NextResponse.json(
        { error: "Venda não encontrada." },
        { status: 404 }
      );
    }

    // If pending, try to consult the fiscal API for an update
    if (sale.nfce_status === "pending") {
      const apiStatus = await FiscalService.consultStatus(saleId);

      if (apiStatus.status === "autorizado" && apiStatus.accessKey) {
        await prisma.sale.update({
          where: { id: saleId },
          data: {
            nfce_status: "authorized",
            nfce_access_key: apiStatus.accessKey,
            nfce_qr_url: apiStatus.qrCodeUrl ?? null,
            nfce_danfe_url: apiStatus.danfeUrl ?? null,
            nfce_protocol: apiStatus.protocol ?? null,
          },
        });

        return NextResponse.json({
          ...sale,
          total_amount: Number(sale.total_amount),
          nfce_status: "authorized",
          nfce_access_key: apiStatus.accessKey,
          nfce_qr_url: apiStatus.qrCodeUrl ?? null,
          nfce_danfe_url: apiStatus.danfeUrl ?? null,
          nfce_protocol: apiStatus.protocol ?? null,
        });
      }
    }

    return NextResponse.json({
      ...sale,
      total_amount: Number(sale.total_amount),
    });
  } catch (error) {
    console.error("[Fiscal] Error fetching status:", error);
    return NextResponse.json(
      { error: "Erro interno ao consultar status." },
      { status: 500 }
    );
  }
}
