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

    // Search using raw SQL to normalize phone numbers (remove non-digits before comparing)
    console.log("[Customer Search] Phone:", phoneRaw, "CPF:", cpfRaw);

    type CustomerResult = {
      id: string;
      name: string | null;
      phone: string | null;
      whatsapp: string | null;
      email: string | null;
      cpf: string | null;
      loyalty_points: number;
      created_at: Date;
    };

    let customer: CustomerResult | null = null;

    // Try phone search using raw SQL to normalize
    if (phoneRaw.length >= 8) {
      // Get last 8-9 digits for matching (handles DDD variations)
      const last9 = phoneRaw.slice(-9);
      const last8 = phoneRaw.slice(-8);
      
      // Use raw SQL to match normalized phone numbers
      const results = await prisma.$queryRaw<CustomerResult[]>`
        SELECT id, name, phone, whatsapp, email, cpf, loyalty_points, created_at
        FROM "Customer"
        WHERE 
          REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE ${'%' + last9}
          OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE ${'%' + last8}
          OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') LIKE ${'%' + last9}
          OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') LIKE ${'%' + last8}
          OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = ${phoneRaw}
          OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') = ${phoneRaw}
        LIMIT 1
      `;
      
      if (results.length > 0) {
        customer = results[0];
      }
    }

    // Fallback: try CPF search
    if (!customer && cpfRaw.length >= 11) {
      customer = await prisma.customer.findFirst({
        where: { cpf: cpfRaw },
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
    }
    
    console.log("[Customer Search] Found:", customer?.name || "none");

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

    // Normalize phone number (remove non-digits)
    const phoneNormalized = phone.replace(/\D/g, "");
    const whatsappNormalized = whatsapp ? whatsapp.replace(/\D/g, "") : undefined;

    // First check if customer exists by normalized phone
    const existingByPhone = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Customer"
      WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = ${phoneNormalized}
      LIMIT 1
    `;

    let customer;
    if (existingByPhone.length > 0) {
      // Update existing customer
      customer = await prisma.customer.update({
        where: { id: existingByPhone[0].id },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(cpf && { cpf: cpf.replace(/\D/g, "") }),
          ...(whatsappNormalized && { whatsapp: whatsappNormalized }),
        },
      });
    } else {
      // Create new customer with normalized phone
      customer = await prisma.customer.create({
        data: {
          phone: phoneNormalized,
          name,
          email,
          cpf: cpf ? cpf.replace(/\D/g, "") : undefined,
          whatsapp: whatsappNormalized,
        },
      });
    }

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("Customer upsert failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
