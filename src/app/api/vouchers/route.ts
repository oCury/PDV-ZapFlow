import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createVoucherSchema, voucherQuerySchema } from "@/lib/validations/vouchers";
import { createVoucher } from "@/lib/vouchers/service";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("vouchers");
  if (gate) return gate;

  const { searchParams } = new URL(req.url);

  const queryParsed = voucherQuerySchema.safeParse({
    status: searchParams.get("status") || undefined,
    customerId: searchParams.get("customerId") || undefined,
    code: searchParams.get("code") || undefined,
  });

  if (!queryParsed.success) {
    return NextResponse.json(
      { error: queryParsed.error.issues[0]?.message || "Parâmetros inválidos" },
      { status: 400 }
    );
  }

  const { status, customerId, code } = queryParsed.data;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const where: Prisma.VoucherWhereInput = {};

  if (status) {
    where.status = status;
  }
  if (customerId) {
    where.customer_id = customerId;
  }
  if (code) {
    where.code = { contains: code, mode: "insensitive" };
  }

  try {
    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
          usages: {
            orderBy: { created_at: "desc" },
            take: 5,
          },
        },
      }),
      prisma.voucher.count({ where }),
    ]);

    return NextResponse.json({
      data: vouchers.map((v) => ({
        id: v.id,
        code: v.code,
        type: v.type,
        originalValue: Number(v.original_value),
        balance: Number(v.balance),
        status: v.status,
        customerId: v.customer_id,
        customer: v.customer,
        expiresAt: v.expires_at,
        createdAt: v.created_at,
        usages: v.usages.map((u) => ({
          id: u.id,
          saleId: u.sale_id,
          amount: Number(u.amount),
          createdAt: u.created_at,
        })),
      })),
      meta: { total, limit, offset },
    });
  } catch (error) {
    console.error("[Vouchers] Error listing vouchers:", error);
    return NextResponse.json(
      { error: "Erro interno ao listar vales." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await requireEntitlement("vouchers");
  if (gate) return gate;

  try {
    const body = await req.json();

    const parsed = createVoucherSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    // Only GIFT vouchers can be created manually; EXCHANGE vouchers are created by exchanges
    if (parsed.data.type !== "GIFT") {
      return NextResponse.json(
        { error: "Apenas vales-presente (GIFT) podem ser criados manualmente." },
        { status: 400 }
      );
    }

    const voucher = await createVoucher({
      type: parsed.data.type,
      originalValue: parsed.data.originalValue,
      customerId: parsed.data.customerId,
      expiresInDays: parsed.data.expiresInDays,
    });

    return NextResponse.json(
      {
        id: voucher.id,
        code: voucher.code,
        type: voucher.type,
        originalValue: Number(voucher.original_value),
        balance: Number(voucher.balance),
        status: voucher.status,
        expiresAt: voucher.expires_at,
        createdAt: voucher.created_at,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Vouchers] Error creating voucher:", error);
    return NextResponse.json(
      { error: "Erro interno ao criar vale." },
      { status: 500 }
    );
  }
}
