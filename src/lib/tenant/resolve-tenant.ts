import { cache } from "react";
import { getTenantIdOrNull } from "./context";

/**
 * Resolve the current tenant id for a scoped query.
 *
 * Cookie-FIRST (per-request, leak-proof): reads the signed session cookie, which
 * is unique to each request — so even if AsyncLocalStorage was contaminated by a
 * prior request's enterWith, requests still resolve to the correct tenant.
 * Falls back to AsyncLocalStorage (set by runWithTenant) for non-request contexts
 * such as crons/webhooks. Fail-closed: throws if neither is available.
 */
export const resolveTenantId = cache(async (): Promise<string> => {
  try {
    const [{ cookies }, { parseSessionToken, SESSION_COOKIE }] = await Promise.all([
      import("next/headers"),
      import("@/lib/auth"),
    ]);
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const session = token ? parseSessionToken(token) : null;
    if (session?.tenantId) return session.tenantId;
  } catch {
    // Not in a request scope (cron/script/runWithTenant) — fall through to ALS.
  }
  const fromAls = getTenantIdOrNull();
  if (fromAls) return fromAls;
  throw new Error(
    "No tenant context: a scoped query ran without a session cookie or runWithTenant()."
  );
});
