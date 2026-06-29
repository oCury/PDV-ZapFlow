import { NextResponse } from "next/server";
import { requireEntitlement } from "@/lib/entitlements-guard";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ShippingItem {
  weight_kg?: number;
  quantity: number;
}

interface ShippingRequestBody {
  cep: string;
  items: ShippingItem[];
}

interface ShippingOption {
  method: string;
  label: string;
  price: number;
  estimated_days: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_ITEM_WEIGHT_KG = 0.3;

const PAC_BASE_PRICE = 15;
const PAC_PER_KG = 2;
const PAC_DAYS = "5-8 dias úteis";

const SEDEX_BASE_PRICE = 25;
const SEDEX_PER_KG = 4;
const SEDEX_DAYS = "1-3 dias úteis";

const MOTOBOY_FLAT_PRICE = 12;
const MOTOBOY_DAYS = "Mesmo dia";

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculateTotalWeight(items: ReadonlyArray<ShippingItem>): number {
  return items.reduce((total, item) => {
    const weight = item.weight_kg ?? DEFAULT_ITEM_WEIGHT_KG;
    return total + weight * item.quantity;
  }, 0);
}

function parseCepRegion(cep: string): string {
  return cep.replace(/\D/g, "").slice(0, 2);
}

function buildMockOptions(
  totalWeight: number,
  originRegion: string,
  destinationRegion: string
): ShippingOption[] {
  const options: ShippingOption[] = [
    {
      method: "PAC",
      label: "PAC - Econômico",
      price: roundPrice(PAC_BASE_PRICE + PAC_PER_KG * totalWeight),
      estimated_days: PAC_DAYS,
    },
    {
      method: "SEDEX",
      label: "SEDEX - Expresso",
      price: roundPrice(SEDEX_BASE_PRICE + SEDEX_PER_KG * totalWeight),
      estimated_days: SEDEX_DAYS,
    },
  ];

  if (originRegion === destinationRegion) {
    options.push({
      method: "MOTOBOY",
      label: "Motoboy - Entrega local",
      price: MOTOBOY_FLAT_PRICE,
      estimated_days: MOTOBOY_DAYS,
    });
  }

  options.push({
    method: "RETIRADA",
    label: "Retirada na loja",
    price: 0,
    estimated_days: "Disponível imediatamente",
  });

  return options;
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── External API ───────────────────────────────────────────────────────────

async function fetchExternalShipping(
  cep: string,
  totalWeight: number
): Promise<ShippingOption[] | null> {
  const apiUrl = process.env.SHIPPING_API_URL;
  const apiToken = process.env.SHIPPING_API_TOKEN;

  if (!apiUrl || !apiToken) {
    return null;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ cep, weight_kg: totalWeight }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { options?: ShippingOption[] };
  return data.options ?? null;
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const gate = await requireEntitlement("deliveries");
    if (gate) return gate;

    const body = (await req.json()) as ShippingRequestBody;
    const { cep, items } = body;

    if (!cep || typeof cep !== "string") {
      return NextResponse.json(
        { error: "CEP é obrigatório" },
        { status: 400 }
      );
    }

    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      return NextResponse.json(
        { error: "CEP inválido. Deve conter 8 dígitos" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Lista de itens é obrigatória" },
        { status: 400 }
      );
    }

    const totalWeight = calculateTotalWeight(items);

    // Try external shipping API first
    const externalOptions = await fetchExternalShipping(cleanCep, totalWeight);
    if (externalOptions) {
      return NextResponse.json({ options: externalOptions });
    }

    // Fallback: mock distance-based calculation
    const originCep = process.env.STORE_CEP ?? "01000000";
    const originRegion = parseCepRegion(originCep);
    const destinationRegion = parseCepRegion(cleanCep);

    const options = buildMockOptions(
      totalWeight,
      originRegion,
      destinationRegion
    );

    return NextResponse.json({ options });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao calcular frete";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
