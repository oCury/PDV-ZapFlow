import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { getConnectionStatus, deleteConnection } from "@/lib/mercadopago/connection";

export async function GET() {
  const tenant = await requireTenant();
  if (!tenant) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  return NextResponse.json(await getConnectionStatus(tenant.tenantId));
}

export async function DELETE() {
  const tenant = await requireTenant();
  if (!tenant) return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  await deleteConnection(tenant.tenantId);
  return NextResponse.json({ disconnected: true });
}
