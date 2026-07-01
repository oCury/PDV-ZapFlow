import { it, expect, vi, beforeEach } from "vitest";
import { createCheckoutLink } from "./checkout";
beforeEach(() => {
  process.env.INFINITEPAY_HANDLE = "zapflow";
  process.env.INFINITEPAY_API_TOKEN = "ip_test";
  process.env.APP_URL = "https://app.test";
});
it("posts the order to InfinitePay and returns the checkout url", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://pay.test/xyz", invoice_slug: "inv_1" }) });
  vi.stubGlobal("fetch", fetchMock);
  const res = await createCheckoutLink({ orderNsu: "ord_123", amountCents: 16900, description: "Assinatura Pro" });
  expect(res).toEqual({ checkoutUrl: "https://pay.test/xyz", invoiceSlug: "inv_1" });
  const [url, opts] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.checkout.infinitepay.io/links");
  const body = JSON.parse((opts as { body: string }).body);
  expect(body.handle).toBe("zapflow");
  expect(body.order_nsu).toBe("ord_123");
  expect(body.items[0].price).toBe(16900);
  expect(body.webhook_url).toBe("https://app.test/api/webhooks/infinitepay");
  expect(body.redirect_url).toBe("https://app.test/signup/sucesso?order=ord_123");
});
it("throws when InfinitePay returns a non-ok response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "bad" }));
  await expect(createCheckoutLink({ orderNsu: "o", amountCents: 1, description: "x" })).rejects.toThrow();
});
