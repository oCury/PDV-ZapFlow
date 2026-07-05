import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/terminals/service";
import type { TerminalProviderName } from "@prisma/client";

const ALLOWED = new Set(["mercadopago", "stone", "connecttef"]);

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!ALLOWED.has(provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  const out = await handleWebhook(provider as TerminalProviderName, headers, rawBody);
  return NextResponse.json(out, { status: out.received ? 200 : 401 });
}
