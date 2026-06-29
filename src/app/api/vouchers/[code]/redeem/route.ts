import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { redeemVoucherSchema } from "@/lib/validations/vouchers";
import { redeemVoucher } from "@/lib/vouchers/service";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("vouchers");
  if (gate) return gate;

  const { code } = await params;

  try {
    const body = await req.json();

    const parsed = redeemVoucherSchema.safeParse({
      code,
      amount: body.amount,
      saleId: body.saleId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const { voucher, usage } = await redeemVoucher(
      code,
      parsed.data.amount,
      parsed.data.saleId
    );

    return NextResponse.json({
      voucher: {
        id: voucher.id,
        code: voucher.code,
        balance: Number(voucher.balance),
        status: voucher.status,
      },
      usage: {
        id: usage.id,
        amount: Number(usage.amount),
        saleId: usage.sale_id,
        createdAt: usage.created_at,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao resgatar vale.";

    const isValidationError =
      message.includes("não encontrado") ||
      message.includes("não está ativo") ||
      message.includes("expirado") ||
      message.includes("insuficiente");

    return NextResponse.json(
      { error: message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
