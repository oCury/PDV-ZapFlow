import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { currentPlan } from "@/lib/entitlements-guard";
import { seatLimit } from "@/lib/entitlements";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      created_at: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { name, email, password, role } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, email e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Já existe um usuário com este email." },
        { status: 409 }
      );
    }

    const plan = (await currentPlan()) ?? "basic";
    const limit = seatLimit(plan);
    if (limit !== null) {
      const activeCount = await prisma.user.count({ where: { active: true } }); // auto-scoped to tenant
      if (activeCount >= limit) {
        return NextResponse.json(
          { success: false, error: "Limite de usuários do seu plano atingido", upgrade: true },
          { status: 403 },
        );
      }
    }

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        password: hashPassword(password),
        role: role === "ADMIN" ? "ADMIN" : "EMPLOYEE",
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Erro ao criar usuário." },
      { status: 500 }
    );
  }
}
