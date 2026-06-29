import { NextRequest, NextResponse } from "next/server";
import evolutionAPI from "@/lib/whatsapp/evolution-api";
import { requireEntitlement } from "@/lib/entitlements-guard";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireEntitlement("whatsapp");
    if (gate) return gate;

    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json(
        { error: "Evolution API não configurada. Verifique EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME no .env" },
        { status: 400 }
      );
    }

    // Get instance name from query parameter or use default from .env
    const { searchParams } = new URL(request.url);
    const instanceName = searchParams.get("instance") || process.env.EVOLUTION_INSTANCE_NAME || "";

    if (!instanceName) {
      return NextResponse.json(
        { error: "Nome da instância não especificado" },
        { status: 400 }
      );
    }

    const config = evolutionAPI.getConfig();

    const result = await evolutionAPI.getQRCode(instanceName);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || "Erro ao gerar QR Code",
          details: `URL: ${config.apiUrl}/instance/connect/${instanceName}`,
        },
        { status: 500 }
      );
    }

    const qrcode = result.data?.qrcode || result.data?.base64 || result.data?.pairingCode;

    if (!qrcode) {
      return NextResponse.json({
        connected: true,
        message: "WhatsApp já está conectado. Não é necessário escanear QR Code.",
      });
    }

    return NextResponse.json({
      qrcode,
      instanceName,
      message: "Escaneie o QR Code com seu WhatsApp",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const gate = await requireEntitlement("whatsapp");
    if (gate) return gate;

    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json(
        { error: "Evolution API não configurada." },
        { status: 400 }
      );
    }

    const result = await evolutionAPI.logout();

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Erro ao desconectar" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "WhatsApp desconectado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
