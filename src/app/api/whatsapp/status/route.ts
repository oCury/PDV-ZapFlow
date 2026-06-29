import { NextRequest, NextResponse } from "next/server";
import evolutionAPI from "@/lib/whatsapp/evolution-api";
import { requireEntitlement } from "@/lib/entitlements-guard";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const gate = await requireEntitlement("whatsapp");
    if (gate) return gate;

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

    // Evolution API v2 may return state at different levels
    const data = result.data as Record<string, unknown> | undefined;
    const instanceData = (data?.instance || data) as Record<string, unknown> | undefined;
    const state = String(instanceData?.state || data?.state || "");
    const isConnected = state === "open";

    return NextResponse.json({
      configured: true,
      connected: isConnected,
      state,
      instanceName: String(instanceData?.instanceName || data?.instanceName || instanceName),
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
