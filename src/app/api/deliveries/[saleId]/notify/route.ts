import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";
import evolutionAPI from "@/lib/whatsapp/evolution-api";

const notifySchema = z.object({
  message: z.string().min(1, "Mensagem é obrigatória").max(1000),
});

/**
 * POST /api/deliveries/[ref]/notify — manual WhatsApp update to the recipient.
 * `ref` is a Sale id (sale-derived) OR a Delivery id (manual delivery).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json(
        { error: "WhatsApp (Evolution API) não configurado." },
        { status: 400 }
      );
    }

    const { saleId: ref } = await params;
    const body = await request.json().catch(() => null);
    const parsed = notifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 }
      );
    }

    const sale = await prisma.sale.findUnique({
      where: { id: ref },
      include: {
        delivery: { select: { recipient_phone: true } },
        customer: { select: { phone: true, whatsapp: true } },
      },
    });
    const standalone = sale
      ? null
      : await prisma.delivery.findUnique({
          where: { id: ref },
          select: { recipient_phone: true },
        });

    if (!sale && !standalone) {
      return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
    }

    const rawPhone = sale
      ? sale.delivery?.recipient_phone ?? sale.customer?.whatsapp ?? sale.customer?.phone ?? ""
      : standalone?.recipient_phone ?? "";
    const number = rawPhone.replace(/\D/g, "");
    if (number.length < 10) {
      return NextResponse.json(
        { error: "Cliente sem telefone válido para notificação." },
        { status: 400 }
      );
    }

    const result = await evolutionAPI.sendText({ number, text: parsed.data.message });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Falha ao enviar WhatsApp" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delivery notify failed:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
