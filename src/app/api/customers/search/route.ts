import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * GET /api/customers/search?phone=…&cpf=…&name=…&q=…
 *
 * Searches customers by phone, CPF, or name.
 * The `q` param auto-detects: digits → phone search, text → name search.
 * Returns loyalty_points so the checkout UI can display available discount.
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let phoneRaw = searchParams.get("phone")?.replace(/\D/g, "") ?? "";
    const cpfRaw = searchParams.get("cpf")?.replace(/\D/g, "") ?? "";
    let nameQuery = searchParams.get("name")?.trim() ?? "";
    const q = searchParams.get("q")?.trim() ?? "";

    // Auto-detect: if q is mostly digits, treat as phone; otherwise as name
    if (q) {
      const digits = q.replace(/\D/g, "");
      if (digits.length >= 8 && digits.length / q.replace(/\s/g, "").length > 0.6) {
        phoneRaw = digits;
      } else {
        nameQuery = q;
      }
    }

    if (!phoneRaw && !cpfRaw && !nameQuery) {
      return NextResponse.json(
        { error: "Informe telefone, nome ou CPF para buscar" },
        { status: 400 }
      );
    }

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

    let customers: CustomerResult[] = [];

    // Phone search
    if (phoneRaw.length >= 8) {
      const last9 = phoneRaw.slice(-9);
      const last8 = phoneRaw.slice(-8);

      customers = await prisma.$queryRaw<CustomerResult[]>`
        SELECT id, name, phone, whatsapp, email, cpf, loyalty_points, created_at
        FROM "customers"
        WHERE
          REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE ${'%' + last9}
          OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') LIKE ${'%' + last8}
          OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') LIKE ${'%' + last9}
          OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') LIKE ${'%' + last8}
          OR REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = ${phoneRaw}
          OR REGEXP_REPLACE(whatsapp, '[^0-9]', '', 'g') = ${phoneRaw}
        LIMIT 10
      `;
    }

    // Name search
    if (customers.length === 0 && nameQuery.length >= 2) {
      const pattern = `%${nameQuery}%`;
      customers = await prisma.$queryRaw<CustomerResult[]>`
        SELECT id, name, phone, whatsapp, email, cpf, loyalty_points, created_at
        FROM "customers"
        WHERE LOWER(name) LIKE LOWER(${pattern})
        ORDER BY name ASC
        LIMIT 10
      `;
    }

    // Fallback: CPF search
    if (customers.length === 0 && cpfRaw.length >= 11) {
      const byCpf = await prisma.customer.findFirst({
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
      if (byCpf) customers = [byCpf];
    }

    if (customers.length === 0) {
      return NextResponse.json(
        { error: "Cliente não encontrado" },
        { status: 404 }
      );
    }

    // If single result, return object directly (backwards compatible)
    // If multiple, return array
    if (customers.length === 1) {
      return NextResponse.json(customers[0]);
    }

    return NextResponse.json({ results: customers });
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
      SELECT id FROM "customers"
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
