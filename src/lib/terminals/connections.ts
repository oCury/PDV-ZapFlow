import { prisma } from "@/lib/prisma";
import { decryptJson } from "@/lib/crypto/secretbox";
import type { ProviderCredentials, TerminalProviderName } from "./types";
import type { ProviderMode, ConnectionStatus } from "@prisma/client";

export interface LoadedConnection {
  id: string;
  provider: TerminalProviderName;
  mode: ProviderMode;
  status: ConnectionStatus;
  externalAccountId: string | null;
  credentials: ProviderCredentials;
}

/**
 * Loads the current tenant's connection for a provider. The tenant-scoped `prisma`
 * client injects `tenant_id`, so `findFirst({ where: { provider } })` returns the
 * single row guaranteed unique by `@@unique([tenant_id, provider])`.
 */
export async function loadConnection(provider: TerminalProviderName): Promise<LoadedConnection | null> {
  const row = await prisma.providerConnection.findFirst({ where: { provider } });
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    externalAccountId: row.external_account_id,
    credentials: decryptJson<ProviderCredentials>(row.credentials),
  };
}
