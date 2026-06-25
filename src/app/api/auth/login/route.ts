import { NextResponse } from "next/server";
import { basePrisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha são obrigatórios." }, { status: 400 });
    }

    const user = await basePrisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json({ error: "Email ou senha inválidos." }, { status: 401 });
    }
    if (!user.active) {
      return NextResponse.json({ error: "Conta desativada. Contate o administrador." }, { status: 403 });
    }
    if (!user.tenant_id) {
      return NextResponse.json({ error: "Usuário sem loja associada." }, { status: 403 });
    }

    await setSessionCookie({
      userId: user.id,
      role: user.role,
      name: user.name,
      tenantId: user.tenant_id,
    });

    return NextResponse.json({ user: { id: user.id, name: user.name, role: user.role } });
  } catch (error: unknown) {
    console.error("[Auth Login] Internal error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Erro interno ao processar login." }, { status: 500 });
  }
}
