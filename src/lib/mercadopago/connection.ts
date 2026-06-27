import { basePrisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretBox";
import { refreshTokens, type MpTokens } from "./oauth";

/** Refresh when the access token expires within this window. */
const REFRESH_BUFFER_MS = 1000 * 60 * 60 * 24; // 24h

export class MpNotConnectedError extends Error {
  constructor(public tenantId: string) {
    super(`Tenant ${tenantId} has no Mercado Pago connection`);
    this.name = "MpNotConnectedError";
  }
}

function connectionData(tokens: MpTokens) {
  return {
    mp_user_id: tokens.mpUserId,
    access_token: encryptSecret(tokens.accessToken),
    refresh_token: encryptSecret(tokens.refreshToken),
    public_key: tokens.publicKey ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.tokenType ?? null,
    live_mode: tokens.liveMode,
    access_token_expires_at: new Date(Date.now() + tokens.expiresInSeconds * 1000),
  };
}

export async function saveConnection(tenantId: string, tokens: MpTokens): Promise<void> {
  const data = connectionData(tokens);
  await basePrisma.mpConnection.upsert({
    where: { tenant_id: tenantId },
    create: { tenant_id: tenantId, ...data },
    update: data,
  });
}

export async function deleteConnection(tenantId: string): Promise<void> {
  await basePrisma.mpConnection.delete({ where: { tenant_id: tenantId } }).catch(() => {});
}

export async function getConnectionStatus(
  tenantId: string
): Promise<{ connected: boolean; mpUserId?: string; liveMode?: boolean; scope?: string }> {
  const conn = await basePrisma.mpConnection.findUnique({ where: { tenant_id: tenantId } });
  if (!conn) return { connected: false };
  return {
    connected: true,
    mpUserId: conn.mp_user_id,
    liveMode: conn.live_mode,
    scope: conn.scope ?? undefined,
  };
}

/**
 * Resolve the access token for a tenant. Refreshes (and persists rotated tokens) when near expiry.
 * Falls back to the env token for tenants without a connection (interim, removable once all connect).
 */
export async function resolveMpAccessToken(tenantId: string): Promise<string> {
  const conn = await basePrisma.mpConnection.findUnique({ where: { tenant_id: tenantId } });

  if (!conn) {
    const envToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (envToken) return envToken;
    throw new MpNotConnectedError(tenantId);
  }

  const expiresAt = conn.access_token_expires_at?.getTime() ?? 0;
  const nearExpiry = expiresAt - Date.now() < REFRESH_BUFFER_MS;

  if (nearExpiry) {
    try {
      const refreshed = await refreshTokens({ refreshToken: decryptSecret(conn.refresh_token) });
      await basePrisma.mpConnection.update({
        where: { tenant_id: tenantId },
        data: connectionData(refreshed),
      });
      return refreshed.accessToken;
    } catch (err) {
      // A concurrent request may have already rotated the (single-use) refresh token.
      // Re-read once: if the connection is now fresh, use it instead of failing.
      const fresh = await basePrisma.mpConnection.findUnique({ where: { tenant_id: tenantId } });
      if (
        fresh &&
        (fresh.access_token_expires_at?.getTime() ?? 0) - Date.now() >= REFRESH_BUFFER_MS
      ) {
        return decryptSecret(fresh.access_token);
      }
      console.error(
        `[mp] token refresh failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
      );
      throw new MpNotConnectedError(tenantId);
    }
  }

  return decryptSecret(conn.access_token);
}
