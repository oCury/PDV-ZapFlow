import { PrismaClient } from "@prisma/client";
import { getTenantId } from "./tenant/context";
import { applyTenantScope, TENANT_MODELS } from "./tenant/scope";

/**
 * Supabase/PgBouncer pool (port 6543) does not support prepared statements.
 * Prisma needs pgbouncer=true to disable them.
 */
function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return url;
  if (url.includes("6543") && !url.includes("pgbouncer=true")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}pgbouncer=true`;
  }
  return url;
}

function makeTenantPrisma(client: PrismaClient) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const scoped = applyTenantScope(
            operation,
            (args ?? {}) as Record<string, unknown>,
            getTenantId()
          );
          return query(scoped as typeof args);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  basePrisma?: PrismaClient;
  prisma?: ReturnType<typeof makeTenantPrisma>;
};

/** Raw, UNSCOPED client. Only for login, provisioning scripts, and the backfill. */
export const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({ datasources: { db: { url: getDatabaseUrl() } } });

/** Tenant-scoped client. The default for all feature code (auto-injects tenant_id). */
export const prisma = globalForPrisma.prisma ?? makeTenantPrisma(basePrisma);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.basePrisma = basePrisma;
  globalForPrisma.prisma = prisma;
}
