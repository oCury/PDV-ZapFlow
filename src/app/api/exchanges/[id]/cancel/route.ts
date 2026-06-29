import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function PUT(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("vouchers");
  if (gate) return gate;

  const { id } = await params;

  try {
    const exchange = await prisma.exchange.findUnique({
      where: { id },
      select: {
        status: true,
        voucher_id: true,
      },
    });

    if (!exchange) {
      return NextResponse.json(
        { error: "Troca nao encontrada." },
        { status: 404 }
      );
    }

    if (exchange.status !== "PENDING" && exchange.status !== "APPROVED") {
      return NextResponse.json(
        {
          error: `Troca nao pode ser cancelada. Status atual: ${exchange.status}`,
        },
        { status: 400 }
      );
    }

    // PENDING and APPROVED exchanges have not had stock restored yet,
    // so cancellation only needs to update status and cancel any voucher.
    await prisma.$transaction(async (tx) => {
      // Cancel associated voucher if exists
      if (exchange.voucher_id) {
        await tx.voucher.update({
          where: { id: exchange.voucher_id },
          data: { status: "CANCELLED" },
        });
      }

      await tx.exchange.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    });

    return NextResponse.json({ status: "CANCELLED", id });
  } catch (error) {
    console.error("[Exchange] Error cancelling:", error);
    return NextResponse.json(
      { error: "Erro interno ao cancelar troca." },
      { status: 500 }
    );
  }
}
