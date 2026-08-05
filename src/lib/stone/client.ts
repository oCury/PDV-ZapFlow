const BASE = process.env.STONE_API_BASE ?? "https://api.pagar.me/core/v5";
export class StoneApiError extends Error { constructor(public status: number, body: string) { super(body); } }
export async function stoneFetch(path: string, init: RequestInit & { apiKey: string }): Promise<any> {
  const { apiKey, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/json", ...(headers as Record<string, string> | undefined) },
  });
  if (!res.ok) throw new StoneApiError(res.status, await res.text());
  return res.json();
}
