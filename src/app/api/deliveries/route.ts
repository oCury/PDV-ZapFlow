import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

const DELIVERY_METHODS = ["MOTOBOY", "CORREIOS", "TRANSPORTADORA"];
const DELIVERY_CHANNELS = ["ONLINE", "WHATSAPP"];
const VALID_STATUSES = [
  "PENDING",
  "READY",
  "DISPATCHED",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
];

/** Sales that require delivery (shipping method is a delivery type, or remote channel). */
const deliverableWhere: Prisma.SaleWhereInput = {
  OR: [
    { shipping_method: { in: DELIVERY_METHODS } },
    { channel: { in: DELIVERY_CHANNELS } },
  ],
};

/** GET /api/deliveries — list deliverable sales joined with their delivery state */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.toUpperCase() ?? "ALL";
    const q = searchParams.get("q")?.trim() ?? "";

    const filters: Prisma.SaleWhereInput[] = [deliverableWhere];

    if (status !== "ALL" && VALID_STATUSES.includes(status)) {
      if (status === "PENDING") {
        // No delivery row yet OR explicitly pending
        filters.push({
          OR: [{ delivery: { is: null } }, { delivery: { status: "PENDING" } }],
        });
      } else {
        filters.push({
          delivery: { status: status as Prisma.EnumDeliveryStatusFilter["equals"] },
        });
      }
    }

    if (q) {
      const digits = q.replace(/\D/g, "");
      filters.push({
        OR: [
          { customer: { name: { contains: q, mode: "insensitive" } } },
          ...(digits ? [{ customer: { phone: { contains: digits } } }] : []),
          { delivery: { recipient_name: { contains: q, mode: "insensitive" } } },
          ...(digits
            ? [{ delivery: { recipient_phone: { contains: digits } } }]
            : []),
        ],
      });
    }

    const sales = await prisma.sale.findMany({
      where: { AND: filters },
      orderBy: { created_at: "desc" },
      take: 200,
      include: {
        delivery: true,
        customer: { select: { name: true, phone: true, whatsapp: true } },
        _count: { select: { items: true } },
      },
    });

    const rows = sales.map((s) => {
      const d = s.delivery;
      return {
        saleId: s.id,
        deliveryId: d?.id ?? null,
        status: d?.status ?? "PENDING",
        carrier: d?.carrier ?? s.shipping_method ?? "MANUAL",
        customerName: d?.recipient_name ?? s.customer?.name ?? null,
        phone: d?.recipient_phone ?? s.customer?.whatsapp ?? s.customer?.phone ?? null,
        address: d?.address ?? s.shipping_address ?? null,
        cep: d?.cep ?? s.shipping_cep ?? null,
        total: Number(s.total_amount),
        fee: d?.fee != null ? Number(d.fee) : s.shipping_cost != null ? Number(s.shipping_cost) : null,
        trackingCode: d?.tracking_code ?? null,
        trackingUrl: d?.tracking_url ?? null,
        driverName: d?.driver_name ?? null,
        driverPhone: d?.driver_phone ?? null,
        notes: d?.notes ?? null,
        channel: s.channel,
        shippingMethod: s.shipping_method ?? null,
        itemCount: s._count.items,
        createdAt: s.created_at,
      };
    });

    return NextResponse.json({ deliveries: rows });
  } catch (error) {
    console.error("Deliveries fetch failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
