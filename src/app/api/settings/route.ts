import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllSettings, setSetting } from "@/lib/settings";

/**
 * GET /api/settings - Returns all store settings
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const settings = await getAllSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[Settings] Error fetching:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar configurações" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings - Update store settings (ADMIN only)
 * Body: { settings: { key: value, ... } }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { success: false, error: "Formato inválido" },
        { status: 400 }
      );
    }

    const allowedKeys = ["followup_days", "cashback_percent", "store_name", "whatsapp_instance", "cashback_message"];

    for (const [key, value] of Object.entries(settings)) {
      if (!allowedKeys.includes(key)) continue;
      if (typeof value !== "string" && typeof value !== "number") continue;

      // Validate numeric settings
      if (key === "followup_days") {
        const num = Number(value);
        if (isNaN(num) || num < 1 || num > 90) {
          return NextResponse.json(
            { success: false, error: "Dias deve ser entre 1 e 90" },
            { status: 400 }
          );
        }
      }

      if (key === "cashback_percent") {
        const num = Number(value);
        if (isNaN(num) || num < 1 || num > 50) {
          return NextResponse.json(
            { success: false, error: "Percentual deve ser entre 1 e 50" },
            { status: 400 }
          );
        }
      }

      await setSetting(key, String(value));
    }

    const updated = await getAllSettings();
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error("[Settings] Error updating:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao salvar configurações" },
      { status: 500 }
    );
  }
}
