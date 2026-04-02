import { NextRequest, NextResponse } from "next/server";
import evolutionAPI from "@/lib/whatsapp/evolution-api";
import { z } from "zod";

const sendMessageSchema = z.object({
  number: z.string().min(10, "Número inválido"),
  message: z.string().min(1, "Mensagem é obrigatória"),
  type: z.enum(["text", "image", "document"]).default("text"),
  mediaUrl: z.string().url().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
  instanceName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json(
        { error: "Evolution API não configurada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { number, message, type, mediaUrl, caption, fileName, instanceName } = parsed.data;
    
    console.log("[WhatsApp Send] Sending to:", number, "via instance:", instanceName || "default");

    let result;

    if (type === "text") {
      result = await evolutionAPI.sendText({ number, text: message }, instanceName);
    } else if (type === "image" && mediaUrl) {
      result = await evolutionAPI.sendMedia({
        number,
        mediaUrl,
        caption: caption || message,
        mediaType: "image",
      }, instanceName);
    } else if (type === "document" && mediaUrl) {
      result = await evolutionAPI.sendMedia({
        number,
        mediaUrl,
        caption: caption || message,
        mediaType: "document",
        fileName,
      }, instanceName);
    } else {
      return NextResponse.json(
        { error: "Tipo de mensagem inválido ou URL de mídia ausente." },
        { status: 400 }
      );
    }

    console.log("[WhatsApp Send] Result:", result);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Erro ao enviar mensagem" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Mensagem enviada com sucesso!",
      data: result.data,
    });
  } catch (error) {
    console.error("[WhatsApp Send] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
