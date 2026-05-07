import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { labelTemplateSchema } from "@/lib/validations/labels";
import { PREDEFINED_TEMPLATES } from "@/lib/labels/generator";

const SETTINGS_KEY = "label_templates";

interface StoredTemplates {
  custom?: {
    widthMm: number;
    heightMm: number;
    columns: number;
    rows: number;
    fontSize: number;
    showPrice: boolean;
    showBarcode: boolean;
    showSize: boolean;
    showColor: boolean;
  };
}

export async function GET() {
  try {
    const raw = await getSetting(SETTINGS_KEY);
    let stored: StoredTemplates = {};

    if (raw) {
      try {
        stored = JSON.parse(raw) as StoredTemplates;
      } catch {
        stored = {};
      }
    }

    return NextResponse.json({
      templates: {
        ...PREDEFINED_TEMPLATES,
        ...(stored.custom ? { custom: stored.custom } : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = labelTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Template inválido", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const stored: StoredTemplates = { custom: parsed.data };
    await setSetting(SETTINGS_KEY, JSON.stringify(stored));

    return NextResponse.json({ success: true, template: parsed.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
