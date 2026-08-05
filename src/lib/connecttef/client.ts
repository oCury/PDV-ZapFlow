export class ConnectTefApiError extends Error { constructor(public status: number, body: string) { super(body); } }
export async function connectTefFetch(endpoint: string, path: string, init: RequestInit & { agentToken: string }): Promise<any> {
  const { agentToken, headers, ...rest } = init;
  const res = await fetch(`${endpoint}${path}`, { ...rest, headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json", ...(headers as Record<string, string> | undefined) } });
  if (!res.ok) throw new ConnectTefApiError(res.status, await res.text());
  return res.json();
}
