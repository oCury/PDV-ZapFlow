import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateTerminalSchema } from "@/lib/validations/terminal";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = updateTerminalSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const terminal = await prisma.paymentTerminal.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ terminal });
}
