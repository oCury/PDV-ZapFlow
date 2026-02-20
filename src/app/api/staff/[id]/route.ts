import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, hashPassword } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.role !== undefined) data.role = body.role;
    if (body.active !== undefined) data.active = body.active;
    if (body.password) data.password = hashPassword(body.password);

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { error: "Erro ao atualizar usuário." },
      { status: 500 }
    );
  }
}
