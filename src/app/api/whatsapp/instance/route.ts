import { NextRequest, NextResponse } from "next/server";
import evolutionAPI from "@/lib/whatsapp/evolution-api";

/**
 * GET /api/whatsapp/instance
 * Check API connection and list instances
 */
export async function GET() {
  try {
    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json({
        configured: false,
        error: "Evolution API não configurada. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no .env",
      });
    }

    if (evolutionAPI.isPlaceholder()) {
      return NextResponse.json({
        configured: true,
        reachable: false,
        isPlaceholder: true,
        error: "As variáveis EVOLUTION_API_URL e EVOLUTION_API_KEY estão com valores de exemplo. Configure com os valores reais do seu servidor.",
      });
    }

    const connectionCheck = await evolutionAPI.checkConnection();

    if (!connectionCheck.success) {
      return NextResponse.json({
        configured: true,
        reachable: false,
        error: connectionCheck.error,
      });
    }

    const instancesResult = await evolutionAPI.fetchInstances();
    
    // Log full result for debugging
    console.log("[WhatsApp Instance] Full result:", JSON.stringify(instancesResult, null, 2));
    
    // Evolution API v2 returns array directly in data, but structure varies
    // Sometimes it's data[].instance.instanceName, sometimes data[].instanceName
    let allInstances: unknown[] = [];
    
    if (Array.isArray(instancesResult.data)) {
      allInstances = instancesResult.data;
    } else if (instancesResult.data && typeof instancesResult.data === 'object') {
      // Maybe it's wrapped in another property
      const dataObj = instancesResult.data as Record<string, unknown>;
      if (Array.isArray(dataObj.instances)) {
        allInstances = dataObj.instances;
      }
    }

    console.log("[WhatsApp Instance] Instances array length:", allInstances.length);
    if (allInstances.length > 0) {
      console.log("[WhatsApp Instance] First instance structure:", JSON.stringify(allInstances[0], null, 2));
    }
    
    // Normalize instance data - Evolution API v2 has different formats
    const normalizedInstances = allInstances.map((inst: unknown) => {
      const instObj = inst as Record<string, unknown>;
      // Try different property paths - Evolution API sometimes nests, sometimes doesn't
      const instanceData = (instObj.instance || instObj) as Record<string, unknown>;
      
      // Get name from various possible paths
      const name = String(
        instanceData.instanceName || 
        instanceData.name || 
        instObj.instanceName || 
        instObj.name || 
        ""
      );
      
      const owner = String(instanceData.owner || instObj.owner || "");
      const status = String(instanceData.status || instanceData.state || instObj.status || instObj.state || "");
      
      console.log("[WhatsApp Instance] Processing:", { name, owner, status });
      
      return {
        instanceName: name,
        owner,
        status,
      };
    }).filter((inst) => inst.instanceName && inst.instanceName !== "undefined");

    console.log("[WhatsApp Instance] Final normalized:", normalizedInstances);

    return NextResponse.json({
      configured: true,
      reachable: true,
      instances: normalizedInstances,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/whatsapp/instance
 * Create a new WhatsApp instance
 */
export async function POST(request: NextRequest) {
  try {
    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json(
        { error: "Evolution API não configurada." },
        { status: 400 }
      );
    }

    if (evolutionAPI.isPlaceholder()) {
      return NextResponse.json(
        {
          error: "Evolution API não configurada corretamente",
          details: "As variáveis EVOLUTION_API_URL e EVOLUTION_API_KEY ainda estão com valores de exemplo. Configure com os valores reais do seu servidor Evolution API.",
          help: "Você precisa de um servidor Evolution API. Visite https://doc.evolution-api.com para mais informações.",
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const instanceName = body.instanceName || process.env.EVOLUTION_INSTANCE_NAME;

    console.log("[WhatsApp Instance] Creating instance:", instanceName);
    console.log("[WhatsApp Instance] API URL:", process.env.EVOLUTION_API_URL);

    const result = await evolutionAPI.createInstance({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    });

    console.log("[WhatsApp Instance] Result:", JSON.stringify(result, null, 2));

    if (!result.success) {
      const errorMessage = result.error || "Erro ao criar instância";
      
      if (errorMessage.includes("fetch failed") || errorMessage.includes("ENOTFOUND")) {
        return NextResponse.json(
          {
            error: "Não foi possível conectar ao servidor Evolution API",
            details: `URL configurada: ${process.env.EVOLUTION_API_URL}`,
            help: "Verifique se a URL está correta e se o servidor está online.",
          },
          { status: 500 }
        );
      }

      if (errorMessage.includes("Forbidden") || errorMessage.includes("403")) {
        return NextResponse.json(
          {
            error: "Acesso negado ao criar instância",
            details: "A API Key não tem permissão para criar instâncias, ou a instância já existe.",
            help: "Verifique se a Global API Key está correta. Se a instância já existe no servidor, ela será detectada automaticamente.",
          },
          { status: 403 }
        );
      }

      if (errorMessage.includes("already in use") || errorMessage.includes("already exists")) {
        return NextResponse.json(
          {
            error: "Instância já existe",
            details: `A instância "${instanceName}" já está criada no servidor.`,
            help: "Atualize a página para verificar o status da instância.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      instance: result.data?.instance,
      apikey: result.data?.hash?.apikey,
      message: "Instância criada com sucesso! Agora você pode conectar via QR Code.",
    });
  } catch (error) {
    console.error("[WhatsApp Instance] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/whatsapp/instance
 * Delete an instance
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!evolutionAPI.isConfigured()) {
      return NextResponse.json(
        { error: "Evolution API não configurada." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const instanceName = searchParams.get("name");

    const result = await evolutionAPI.deleteInstance(instanceName || undefined);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Erro ao deletar instância" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Instância deletada com sucesso",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
