import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/customers/search?phone=…&cpf=…
 *
 * Searches customers by phone number or CPF (M3).
 * Returns loyalty_points so the checkout UI can display available discount.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const phoneRaw = searchParams.get("phone")?.replace(/\D/g, "") ?? "";
    const cpfRaw = searchParams.get("cpf")?.replace(/\D/g, "") ?? "";

    if (!phoneRaw && !cpfRaw) {
      return NextResponse.json(
        { error: "Informe telefone ou CPF para buscar" },
        { status: 400 }
      );
    }

    if (phoneRaw && phoneRaw.length < 10) {
      return NextResponse.json(
        { error: "Telefone deve ter pelo menos 10 dígitos" },
        { status: 400 }
      );
    }

    // Search: phone by contains (partial match) or cpf by exact match
    const conditions: object[] = [];
    if (phoneRaw.length >= 10) {
      conditions.push({ phone: { contains: phoneRaw } });
      conditions.push({ phone: { endsWith: phoneRaw } });
    }
    if (cpfRaw.length >= 11) {
      conditions.push({ cpf: cpfRaw });
    }

    const customer = await prisma.customer.findFirst({
      where: { OR: conditions },
      select: {
        id: true,
        name: true,
        phone: true,
        whatsapp: true,
        email: true,
        cpf: true,
        loyalty_points: true,
        created_at: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Cliente não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(customer);
  } catch (error) {
    console.error("Customer search failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * POST /api/customers/search  →  upsert customer
 *
 * Creates or updates a customer record. Used from the checkout modal when
 * an operator types a CPF that doesn't exist yet.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, phone, email, cpf, whatsapp } = body as {
      name?: string;
      phone: string;
      email?: string;
      cpf?: string;
      whatsapp?: string;
    };

    if (!phone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.upsert({
      where: { phone },
      update: {
        ...(name && { name }),
        ...(email && { email }),
        ...(cpf && { cpf: cpf.replace(/\D/g, "") }),
        ...(whatsapp && { whatsapp }),
      },
      create: {
        phone,
        name,
        email,
        cpf: cpf ? cpf.replace(/\D/g, "") : undefined,
        whatsapp,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("Customer upsert failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
