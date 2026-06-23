import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";
import { canTransition, getCarrier } from "@/lib/delivery";
import type { DeliveryStatus, Prisma } from "@prisma/client";

const patchSchema = z.object({
  status: z
    .enum(["PENDING", "READY", "DISPATCHED", "DELIVERED", "FAILED", "CANCELLED"])
    .optional(),
  carrier: z.string().max(40).optional(),
  trackingCode: z.string().max(120).nullable().optional(),
  trackingUrl: z.string().url().max(300).nullable().optional(),
  driverName: z.string().max(120).nullable().optional(),
  driverPhone: z.string().max(40).nullable().optional(),
  fee: z.number().nonnegative().nullable().optional(),
  recipientName: z.string().max(160).nullable().optional(),
  recipientPhone: z.string().max(40).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  cep: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** PATCH /api/deliveries/[saleId] — upsert the delivery state for a sale */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { saleId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        delivery: true,
        customer: { select: { name: true, phone: true, whatsapp: true } },
      },
    });
    if (!sale) {
      return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
    }

    const existing = sale.delivery;
    const currentStatus: DeliveryStatus = existing?.status ?? "PENDING";

    if (input.status && !canTransition(currentStatus, input.status)) {
      return NextResponse.json(
        { error: `Transição inválida: ${currentStatus} → ${input.status}` },
        { status: 400 }
      );
    }

    // Dispatch through the carrier adapter when moving to DISPATCHED with a
    // non-manual carrier. Manual deliveries skip this (operator-handled).
    let dispatchInfo: {
      externalId?: string;
      trackingCode?: string;
      trackingUrl?: string;
    } = {};
    const effectiveCarrier = (input.carrier ?? existing?.carrier ?? "MANUAL").toUpperCase();
    if (
      input.status === "DISPATCHED" &&
      currentStatus !== "DISPATCHED" &&
      effectiveCarrier !== "MANUAL"
    ) {
      const result = await getCarrier(effectiveCarrier).dispatch({
        saleId,
        recipientName: input.recipientName ?? existing?.recipient_name ?? sale.customer?.name,
        recipientPhone:
          input.recipientPhone ??
          existing?.recipient_phone ??
          sale.customer?.whatsapp ??
          sale.customer?.phone,
        address: input.address ?? existing?.address ?? sale.shipping_address,
        cep: input.cep ?? existing?.cep ?? sale.shipping_cep,
      });
      if (!result.success) {
        return NextResponse.json(
          { error: result.error ?? "Falha ao despachar com a transportadora" },
          { status: 502 }
        );
      }
      dispatchInfo = result.data ?? {};
    }

    // Only write the fields that were provided, plus lifecycle timestamps.
    const writable: Prisma.DeliveryUncheckedUpdateInput = {};
    if (input.status !== undefined) writable.status = input.status;
    if (input.carrier !== undefined) writable.carrier = input.carrier;
    if (input.trackingCode !== undefined) writable.tracking_code = input.trackingCode;
    if (input.trackingUrl !== undefined) writable.tracking_url = input.trackingUrl;
    if (input.driverName !== undefined) writable.driver_name = input.driverName;
    if (input.driverPhone !== undefined) writable.driver_phone = input.driverPhone;
    if (input.fee !== undefined) writable.fee = input.fee;
    if (input.recipientName !== undefined) writable.recipient_name = input.recipientName;
    if (input.recipientPhone !== undefined) writable.recipient_phone = input.recipientPhone;
    if (input.address !== undefined) writable.address = input.address;
    if (input.cep !== undefined) writable.cep = input.cep;
    if (input.notes !== undefined) writable.notes = input.notes;
    if (dispatchInfo.externalId) writable.external_id = dispatchInfo.externalId;
    if (dispatchInfo.trackingCode) writable.tracking_code = dispatchInfo.trackingCode;
    if (dispatchInfo.trackingUrl) writable.tracking_url = dispatchInfo.trackingUrl;
    if (input.status === "DISPATCHED" && !existing?.dispatched_at) {
      writable.dispatched_at = new Date();
    }
    if (input.status === "DELIVERED" && !existing?.delivered_at) {
      writable.delivered_at = new Date();
    }

    const delivery = await prisma.delivery.upsert({
      where: { sale_id: saleId },
      update: writable,
      create: {
        sale_id: saleId,
        status: input.status ?? "PENDING",
        carrier: input.carrier ?? "MANUAL",
        tracking_code: input.trackingCode ?? dispatchInfo.trackingCode ?? null,
        tracking_url: input.trackingUrl ?? dispatchInfo.trackingUrl ?? null,
        external_id: dispatchInfo.externalId ?? null,
        driver_name: input.driverName ?? null,
        driver_phone: input.driverPhone ?? null,
        fee: input.fee ?? sale.shipping_cost ?? null,
        recipient_name: input.recipientName ?? sale.customer?.name ?? null,
        recipient_phone:
          input.recipientPhone ?? sale.customer?.whatsapp ?? sale.customer?.phone ?? null,
        address: input.address ?? sale.shipping_address ?? null,
        cep: input.cep ?? sale.shipping_cep ?? null,
        notes: input.notes ?? null,
        dispatched_at: input.status === "DISPATCHED" ? new Date() : null,
        delivered_at: input.status === "DELIVERED" ? new Date() : null,
      },
    });

    return NextResponse.json({ delivery });
  } catch (error) {
    console.error("Delivery update failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
