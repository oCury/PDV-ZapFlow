import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { cancelVoucher } from "@/lib/vouchers/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;

  try {
    const voucher = await cancelVoucher(code);

    return NextResponse.json({
      id: voucher.id,
      code: voucher.code,
      status: voucher.status,
      balance: Number(voucher.balance),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao cancelar vale.";

    const isValidationError =
      message.includes("não encontrado") ||
      message.includes("já está cancelado") ||
      message.includes("já utilizado");

    return NextResponse.json(
      { error: message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
