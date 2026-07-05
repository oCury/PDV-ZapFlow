import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import type { TerminalProviderName } from "@prisma/client";

/**
 * PATCH /api/settings/providers/[provider]
 * Toggles the mode (sandbox ↔ live) for an existing provider connection.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const { provider } = await params;
  const body = await req.json();
  const { mode } = body as { mode: unknown };

  if (mode !== "sandbox" && mode !== "live") {
    return NextResponse.json({ error: "mode inválido" }, { status: 400 });
  }

  const row = await prisma.providerConnection.findFirst({
    where: { provider: provider as TerminalProviderName },
  });
  if (!row) {
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  }

  await prisma.providerConnection.update({
    where: { id: row.id },
    data: { mode, status: mode === "live" ? "live" : "sandbox" },
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/settings/providers/[provider]
 * Soft-disconnects a provider connection (sets status to "disconnected").
 * Credentials remain encrypted in the DB; the row is not deleted.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const { provider } = await params;

  const row = await prisma.providerConnection.findFirst({
    where: { provider: provider as TerminalProviderName },
  });

  if (row) {
    await prisma.providerConnection.update({
      where: { id: row.id },
      data: { status: "disconnected" },
    });
  }

  return NextResponse.json({ ok: true });
}
