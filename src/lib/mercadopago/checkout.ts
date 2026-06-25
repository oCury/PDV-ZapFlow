import { createHmac } from "crypto";

const MP_BASE_URL = "https://api.mercadopago.com";

function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured");
  return token;
}

export async function getPayment(paymentId: string) {
  const res = await fetch(`${MP_BASE_URL}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mercado Pago API ${res.status}: ${body}`);
  }

  return res.json() as Promise<{
    id: number;
    status: string;
    external_reference: string;
  }>;
}

export function validateWebhookSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string
): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;

  const parts: Record<string, string> = {};
  for (const segment of xSignature.split(",")) {
    const [key, ...rest] = segment.split("=");
    parts[key.trim()] = rest.join("=").trim();
  }

  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const computed = createHmac("sha256", secret).update(manifest).digest("hex");

  return computed === v1;
}
