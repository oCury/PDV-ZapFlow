import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone")?.replace(/\D/g, "");

    if (!phone || phone.length < 10) {
      return NextResponse.json(
        { error: "Phone number required (min 10 digits)" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone: { endsWith: phone } },
          { phone: phone },
          { whatsapp: { endsWith: phone } },
          { whatsapp: phone },
        ],
      },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      whatsapp: customer.whatsapp,
    });
  } catch {
    return NextResponse.json(
      { error: "Error searching customer" },
      { status: 500 }
    );
  }
}
