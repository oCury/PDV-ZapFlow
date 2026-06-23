import { GoogleGenAI } from "@google/genai";
import { getSession } from "@/lib/auth";

const SYSTEM_PROMPT = `Você é o assistente de suporte do PDV-ZapFlow, um sistema de Ponto de Venda voltado para o varejo de moda brasileiro.

## Sobre o sistema
O PDV-ZapFlow oferece:
- **Catálogo de produtos**: produtos simples e com grade de variantes (tamanho/cor), importação de catálogo
- **PDV (Ponto de Venda)**: vendas presenciais com busca por nome, código de barras ou SKU, seletor de variantes
- **Pagamentos**: PIX, cartão (Mercado Pago Point Smart), dinheiro, voucher/vale e pagamentos mistos
- **Entregas**: gestão de entregas (motoboy, Correios, transportadora), criação manual ou a partir da venda, aviso ao cliente via WhatsApp
- **Fiscal**: emissão de NFC-e (Nota Fiscal de Consumidor Eletrônica) via FocusNFe/PlugNotas
- **Clientes e fidelidade**: cadastro de clientes, programa de cashback por pontos
- **Follow-up via WhatsApp**: mensagens automáticas pós-venda via Evolution API
- **Trocas e devoluções**: registro de trocas com motivo, produto e operador
- **Comissões**: controle de comissões por vendedor/operador
- **Mesas e comandas**: gestão de mesas para operações estilo restaurante/cafeteria
- **Relatórios**: curva ABC, margem de lucro, giro de estoque, relatório de vendas por período
- **Etiquetas**: impressão de etiquetas de produtos com código de barras
- **Vouchers/Vales**: emissão e resgate de vouchers de desconto
- **Estoque**: controle de estoque por variante, alertas de estoque baixo

## Seu papel
- Você atende **operadores e administradores** da loja que usam o sistema
- Responda de forma **amigável, clara e direta** em português brasileiro (pt-BR)
- Use linguagem simples e objetiva, adequada para o usuário brasileiro médio
- Seja **prático e objetivo**: vá direto ao ponto, sem rodeios
- Para dúvidas de uso, explique o passo a passo de forma simples
- Para erros técnicos, sugira: verificar as configurações, atualizar a página, ou entrar em contato com o desenvolvedor
- Se não souber a resposta, seja honesto e sugira contatar o suporte técnico

## Limitações
- Você não tem acesso ao banco de dados nem ao estado atual do sistema do usuário
- Não é possível executar ações no sistema em nome do usuário
- Para problemas de configuração avançada (NFC-e, Evolution API, etc.), oriente a revisar as configurações em **Configurações** no menu lateral`;

type MessageRole = "user" | "assistant";

interface ChatMessage {
  role: MessageRole;
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
}

const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 4000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

// Best-effort in-memory rate limiter (per user, per process). On serverless
// this is per-instance, not global — it caps abuse from a single warm instance
// but is not a substitute for an edge/Redis limiter at high scale.
const RATE_LIMIT = 20; // requests
const RATE_WINDOW_MS = 60_000; // per minute
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (bucket.count >= RATE_LIMIT) return true;
  bucket.count += 1;
  return false;
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  // 1. Authentication — this endpoint proxies a paid LLM API and must not be public.
  const session = await getSession();
  if (!session) {
    return jsonError("Não autorizado", 401);
  }

  // 2. Rate limiting per authenticated user.
  if (isRateLimited(session.userId)) {
    return jsonError(
      "Muitas mensagens em pouco tempo. Aguarde um momento e tente novamente.",
      429
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError("GEMINI_API_KEY não configurada", 500);
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON inválido", 400);
  }

  const { messages } = body;

  if (!messages || !Array.isArray(messages)) {
    return jsonError("Campo messages é obrigatório", 400);
  }

  // 3. Input hygiene: cap message count and per-message length to bound token usage.
  //    Gemini uses roles "user" and "model" (assistant -> model).
  const contents = messages
    .slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content ?? "").slice(0, MAX_MESSAGE_CHARS) }],
    }))
    .filter((m) => m.parts[0].text.length > 0);

  if (contents.length === 0) {
    return jsonError("Nenhuma mensagem válida fornecida", 400);
  }

  const ai = new GoogleGenAI({ apiKey });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await ai.models.generateContentStream({
          model: MODEL,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            maxOutputTokens: 1024,
          },
        });

        for await (const chunk of stream) {
          const text = chunk.text;
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        // Surface the failure to the client instead of silently truncating.
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
