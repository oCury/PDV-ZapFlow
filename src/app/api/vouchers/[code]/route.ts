import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/auth";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const t = await requireTenant();
  if (!t) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("vouchers");
  if (gate) return gate;

  const { code } = await params;

  try {
    const voucher = await prisma.voucher.findFirst({
      where: { code },
      include: {
        customer: {
          select: { id: true, name: true, phone: true },
        },
        usages: {
          orderBy: { created_at: "desc" },
          include: {
            sale: {
              select: {
                id: true,
                total_amount: true,
                created_at: true,
              },
            },
          },
        },
      },
    });

    if (!voucher) {
      return NextResponse.json(
        { error: "Vale não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: voucher.id,
      code: voucher.code,
      type: voucher.type,
      originalValue: Number(voucher.original_value),
      balance: Number(voucher.balance),
      status: voucher.status,
      customerId: voucher.customer_id,
      customer: voucher.customer,
      expiresAt: voucher.expires_at,
      createdAt: voucher.created_at,
      usages: voucher.usages.map((u) => ({
        id: u.id,
        saleId: u.sale_id,
        amount: Number(u.amount),
        createdAt: u.created_at,
        sale: u.sale
          ? {
              id: u.sale.id,
              totalAmount: Number(u.sale.total_amount),
              createdAt: u.sale.created_at,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("[Vouchers] Error fetching voucher:", error);
    return NextResponse.json(
      { error: "Erro interno ao buscar vale." },
      { status: 500 }
    );
  }
}
