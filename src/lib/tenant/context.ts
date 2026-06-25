import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantStore {
  tenantId: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Run `fn` with the tenant context bound for its whole async subtree. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

/** Bind the tenant context for the rest of the current async execution (request handler). */
export function enterTenant(tenantId: string): void {
  tenantStorage.enterWith({ tenantId });
}

/** Current tenant id. Throws (fail-closed) if no context is set. */
export function getTenantId(): string {
  const store = tenantStorage.getStore();
  if (!store?.tenantId) {
    throw new Error(
      "No tenant context: a tenant-scoped query ran outside requireTenant()/runWithTenant()."
    );
  }
  return store.tenantId;
}

/** Current tenant id or null — for the rare deliberately-unscoped path. */
export function getTenantIdOrNull(): string | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}
