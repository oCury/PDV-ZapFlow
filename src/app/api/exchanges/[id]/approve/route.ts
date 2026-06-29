import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { processExchange } from "@/lib/exchanges/process";
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
      select: { status: true },
    });

    if (!exchange) {
      return NextResponse.json(
        { error: "Troca nao encontrada." },
        { status: 404 }
      );
    }

    if (exchange.status !== "PENDING") {
      return NextResponse.json(
        { error: `Troca nao pode ser aprovada. Status atual: ${exchange.status}` },
        { status: 400 }
      );
    }

    const processed = await processExchange(id);

    return NextResponse.json({
      ...processed,
      total_returned: Number(processed.total_returned),
      credit_generated: processed.credit_generated
        ? Number(processed.credit_generated)
        : null,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro interno ao aprovar troca.";
    return NextResponse.json(
      { error: message },
      { status: message.includes("Quantidade excede") ? 400 : 500 }
    );
  }
}
