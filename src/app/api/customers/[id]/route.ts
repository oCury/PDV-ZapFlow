import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * PUT /api/customers/[id] - Update customer (ADMIN only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, phone, email, cpf, whatsapp } = body;

    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const phoneNormalized = phone ? phone.replace(/\D/g, "") : undefined;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(phoneNormalized && { phone: phoneNormalized }),
        ...(email !== undefined && { email: email || null }),
        ...(cpf !== undefined && { cpf: cpf ? cpf.replace(/\D/g, "") : null }),
        ...(whatsapp !== undefined && { whatsapp: whatsapp ? whatsapp.replace(/\D/g, "") : null }),
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error("Customer update failed:", error);
    return NextResponse.json({ error: "Erro ao atualizar cliente" }, { status: 500 });
  }
}

/**
 * DELETE /api/customers/[id] - Delete customer (ADMIN only)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await prisma.customer.findUnique({
      where: { id },
      include: { _count: { select: { sales: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    if (existing._count.sales > 0) {
      return NextResponse.json(
        { error: `Cliente possui ${existing._count.sales} venda(s) vinculada(s). Não é possível excluir.` },
        { status: 409 }
      );
    }

    await prisma.customer.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Customer delete failed:", error);
    return NextResponse.json({ error: "Erro ao excluir cliente" }, { status: 500 });
  }
}
