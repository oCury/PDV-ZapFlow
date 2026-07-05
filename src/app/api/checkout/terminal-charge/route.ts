import { NextResponse } from "next/server";
import { terminalChargeSchema } from "@/lib/validations/terminal";
import { getSession } from "@/lib/auth";
import { initiateCharge } from "@/lib/terminals/service";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const parsed = terminalChargeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados da cobrança inválidos" }, { status: 400 });
  }
  const { terminalId, method, installments, totalAmount, items, customerId } = parsed.data;

  const result = await initiateCharge({ terminalId, method, installments, totalAmount, items, customerId });

  if (!result.ok) {
    const status =
      result.error.code === "DEVICE_BUSY" ? 409
      : result.error.code === "CONFIG" ? 400
      : 502;
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status });
  }

  return NextResponse.json({ chargeId: result.data.chargeId, status: result.data.status });
}
