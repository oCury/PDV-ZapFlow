import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, requireAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const terminals = await prisma.paymentTerminal.findMany({
    orderBy: { created_at: "asc" },
  });
  return NextResponse.json({ terminals });
}

// POST — manually register a terminal (used for providers without device sync)
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  const { name, deviceExternalId, provider } = await req.json();
  if (
    !name ||
    !deviceExternalId ||
    !["mercadopago", "stone", "connecttef"].includes(provider)
  ) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const terminal = await prisma.paymentTerminal.create({
    data: {
      name,
      provider,
      device_external_id: deviceExternalId,
      mp_device_id: deviceExternalId, // legacy required column until Phase 11; mirror the device id
      is_active: true,
    } as any, // tenant_id injected by the scoped client
  });
  return NextResponse.json({ id: terminal.id });
}
