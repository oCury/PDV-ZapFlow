import { createHmac } from "crypto";

export async function getPayment(paymentId: string, accessToken: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
  if (!secret) {
    // No secret configured: allow in dev/test for frictionless local work, but
    // REJECT in production so an unconfigured deploy can't accept forged webhooks.
    return process.env.NODE_ENV !== "production";
  }

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
