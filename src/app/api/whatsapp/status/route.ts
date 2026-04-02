import { NextRequest, NextResponse } from "next/server";
import evolutionAPI from "@/lib/whatsapp/evolution-api";

export async function GET(request: NextRequest) {
  try {
    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json({
        configured: false,
        connected: false,
        message: "Evolution API não configurada. Verifique as variáveis de ambiente.",
      });
    }

    // Get instance name from query parameter or use default from .env
    const { searchParams } = new URL(request.url);
    const instanceName = searchParams.get("instance") || process.env.EVOLUTION_INSTANCE_NAME || "";

    const result = await evolutionAPI.getInstanceStatus(instanceName);

    if (!result.success) {
      return NextResponse.json({
        configured: true,
        connected: false,
        instanceName,
        error: result.error,
        message: "Erro ao verificar status da instância.",
      });
    }

    const isConnected = result.data?.state === "open";

    return NextResponse.json({
      configured: true,
      connected: isConnected,
      state: result.data?.state,
      instanceName: result.data?.instanceName || instanceName,
      message: isConnected
        ? "WhatsApp conectado e pronto para uso."
        : "WhatsApp desconectado. Escaneie o QR Code para conectar.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
