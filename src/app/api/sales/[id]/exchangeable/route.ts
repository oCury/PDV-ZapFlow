import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getExchangeableItems } from "@/lib/exchanges/process";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const items = await getExchangeableItems(id);
    return NextResponse.json(items);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro interno ao buscar itens trocaveis.";
    const isValidation =
      message.includes("nao encontrada") || message.includes("Prazo de troca");
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500 }
    );
  }
}
