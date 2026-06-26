/** Prisma model names (the `model` value in $allModels) that are tenant-owned. */
export const TENANT_MODELS = new Set<string>([
  "User", "Category", "Product", "ProductVariant", "Customer", "Table",
  "Sale", "SalePayment", "PaymentTerminal", "TerminalCharge",
  "CashRegisterShift", "SaleItem", "CustomerFollowup", "StoreSettings",
  "CommissionRule", "CommissionCategoryRule", "CommissionTier", "SalesGoal",
  "FiscalQueue", "FiscalEvent", "FiscalSequence", "Exchange", "ExchangeItem",
  "Voucher", "VoucherUsage", "Delivery",
]);

type AnyArgs = Record<string, unknown>;

/**
 * Returns a shallow copy of `args` with tenant_id enforced for `operation`.
 * Pure — no DB access. Prisma 6 accepts non-unique fields in unique-where ops,
 * so tenant_id is injected directly into `where` for find/update/delete-by-id.
 */
export function applyTenantScope(operation: string, args: AnyArgs, tenantId: string): AnyArgs {
  const next: AnyArgs = { ...(args ?? {}) };
  const withTenantWhere = () => {
    next.where = { ...((next.where as AnyArgs) ?? {}), tenant_id: tenantId };
  };

  switch (operation) {
    case "create":
      next.data = { ...((next.data as AnyArgs) ?? {}), tenant_id: tenantId };
      break;
    case "createMany":
    case "createManyAndReturn":
      next.data = Array.isArray(next.data)
        ? (next.data as AnyArgs[]).map((d) => ({ ...d, tenant_id: tenantId }))
        : { ...((next.data as AnyArgs) ?? {}), tenant_id: tenantId };
      break;
    case "upsert":
      withTenantWhere();
      next.create = { ...((next.create as AnyArgs) ?? {}), tenant_id: tenantId };
      break;
    case "findUnique":
    case "findUniqueOrThrow":
    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
    case "delete":
    case "deleteMany":
    case "count":
    case "aggregate":
    case "groupBy":
      withTenantWhere();
      break;
    default:
      throw new Error(
        `applyTenantScope: unhandled operation "${operation}" on a tenant-owned model`
      );
  }
  return next;
}
