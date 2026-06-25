import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";
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

interface DeliveryRow {
  saleId: string | null;
  deliveryId: string | null;
  status: string;
  carrier: string;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  cep: string | null;
  total: number;
  fee: number | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  driverName: string | null;
  driverPhone: string | null;
  notes: string | null;
  channel: string | null;
  shippingMethod: string | null;
  itemCount: number;
  createdAt: Date;
}

/** GET /api/deliveries — deliverable sales + standalone manual deliveries */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.toUpperCase() ?? "ALL";
    const q = searchParams.get("q")?.trim() ?? "";
    const digits = q.replace(/\D/g, "");

    // ── Sale-derived deliveries ──────────────────────────────────────────────
    const saleFilters: Prisma.SaleWhereInput[] = [deliverableWhere];
    if (status !== "ALL" && VALID_STATUSES.includes(status)) {
      if (status === "PENDING") {
        saleFilters.push({
          OR: [{ delivery: { is: null } }, { delivery: { status: "PENDING" } }],
        });
      } else {
        saleFilters.push({
          delivery: { status: status as Prisma.EnumDeliveryStatusFilter["equals"] },
        });
      }
    }
    if (q) {
      saleFilters.push({
        OR: [
          { customer: { name: { contains: q, mode: "insensitive" } } },
          ...(digits ? [{ customer: { phone: { contains: digits } } }] : []),
          { delivery: { recipient_name: { contains: q, mode: "insensitive" } } },
          ...(digits ? [{ delivery: { recipient_phone: { contains: digits } } }] : []),
        ],
      });
    }

    const sales = await prisma.sale.findMany({
      where: { AND: saleFilters },
      orderBy: { created_at: "desc" },
      take: 200,
      include: {
        delivery: true,
        customer: { select: { name: true, phone: true, whatsapp: true } },
        _count: { select: { items: true } },
      },
    });

    const saleRows: DeliveryRow[] = sales.map((s) => {
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

    // ── Standalone (manual) deliveries — no linked sale ──────────────────────
    const standaloneFilters: Prisma.DeliveryWhereInput[] = [{ sale_id: null }];
    if (status !== "ALL" && VALID_STATUSES.includes(status)) {
      standaloneFilters.push({ status: status as Prisma.EnumDeliveryStatusFilter["equals"] });
    }
    if (q) {
      standaloneFilters.push({
        OR: [
          { recipient_name: { contains: q, mode: "insensitive" } },
          ...(digits ? [{ recipient_phone: { contains: digits } }] : []),
        ],
      });
    }

    const manual = await prisma.delivery.findMany({
      where: { AND: standaloneFilters },
      orderBy: { created_at: "desc" },
      take: 200,
    });

    const manualRows: DeliveryRow[] = manual.map((d) => ({
      saleId: null,
      deliveryId: d.id,
      status: d.status,
      carrier: d.carrier,
      customerName: d.recipient_name,
      phone: d.recipient_phone,
      address: d.address,
      cep: d.cep,
      total: 0,
      fee: d.fee != null ? Number(d.fee) : null,
      trackingCode: d.tracking_code,
      trackingUrl: d.tracking_url,
      driverName: d.driver_name,
      driverPhone: d.driver_phone,
      notes: d.notes,
      channel: "MANUAL",
      shippingMethod: null,
      itemCount: 0,
      createdAt: d.created_at,
    }));

    const rows = [...saleRows, ...manualRows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    return NextResponse.json({ deliveries: rows });
  } catch (error) {
    console.error("Deliveries fetch failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

const createSchema = z.object({
  recipientName: z.string().min(1, "Nome do destinatário é obrigatório").max(160),
  recipientPhone: z.string().max(40).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  cep: z.string().max(20).nullable().optional(),
  fee: z.number().nonnegative().nullable().optional(),
  carrier: z.string().max(40).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** POST /api/deliveries — create a standalone (manual) delivery, not tied to a sale */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const delivery = await prisma.delivery.create({
      data: {
        status: "PENDING",
        carrier: input.carrier ?? "MANUAL",
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone ?? null,
        address: input.address ?? null,
        cep: input.cep ?? null,
        fee: input.fee ?? null,
        notes: input.notes ?? null,
      },
    });

    return NextResponse.json({ delivery }, { status: 201 });
  } catch (error) {
    console.error("Delivery create failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
