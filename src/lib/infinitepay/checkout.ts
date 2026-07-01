// ⚠️ Wire details (endpoint path, auth header, key names) are from InfinitePay public docs;
// confirm against authenticated docs and adjust if needed.
const ENDPOINT = "https://api.checkout.infinitepay.io/links";

export async function createCheckoutLink(p: {
  orderNsu: string;
  amountCents: number;
  description: string;
}): Promise<{ checkoutUrl: string; invoiceSlug: string | null }> {
  const handle = process.env.INFINITEPAY_HANDLE;
  const token = process.env.INFINITEPAY_API_TOKEN;
  const appUrl = process.env.APP_URL ?? "https://pdv-zap-flow.vercel.app";
  if (!handle || !token) throw new Error("INFINITEPAY_HANDLE and INFINITEPAY_API_TOKEN are required");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      handle,
      order_nsu: p.orderNsu,
      redirect_url: `${appUrl}/signup/sucesso?order=${p.orderNsu}`,
      webhook_url: `${appUrl}/api/webhooks/infinitepay`,
      items: [{ name: p.description, quantity: 1, price: p.amountCents }],
    }),
  });
  if (!res.ok) throw new Error(`InfinitePay link creation failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url?: string; checkout_url?: string; invoice_slug?: string };
  const checkoutUrl = data.url ?? data.checkout_url;
  if (!checkoutUrl) throw new Error("InfinitePay response missing checkout url");
  return { checkoutUrl, invoiceSlug: data.invoice_slug ?? null };
}
