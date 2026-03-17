import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/** GET /api/customers — list all customers (admin only) */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        cpf: true,
        loyalty_points: true,
        created_at: true,
        _count: { select: { sales: true } },
      },
      orderBy: { loyalty_points: "desc" },
    });

    return NextResponse.json(customers);
  } catch (error) {
    console.error("Customers fetch failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
