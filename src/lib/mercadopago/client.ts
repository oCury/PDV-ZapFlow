export const MP_BASE_URL = "https://api.mercadopago.com";

export function getAccessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN is not configured");
  return token;
}

export class MpApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`Mercado Pago API ${status}: ${body}`);
    this.name = "MpApiError";
  }
}

export async function mpFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<unknown> {
  const { idempotencyKey, headers, ...rest } = init;
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    throw new MpApiError(res.status, await res.text());
  }
  return res.json();
}
