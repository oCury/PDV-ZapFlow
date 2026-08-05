import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/terminals/service";
import type { TerminalProviderName } from "@prisma/client";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const { provider, externalOrderId } = await req.json();
  const body = JSON.stringify({ externalOrderId });
  const out = await handleWebhook(provider as TerminalProviderName, { "content-type": "application/json" }, body);
  return NextResponse.json(out);
}
