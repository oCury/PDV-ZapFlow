import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_1 = {
  name: process.env.TENANT1_NAME ?? "Loja Principal",
  slug: process.env.TENANT1_SLUG ?? "loja-principal",
};

// Prisma model accessors (camelCase) that own a tenant_id column.
const MODELS = [
  "user", "category", "product", "productVariant", "customer", "table",
  "sale", "salePayment", "paymentTerminal", "terminalCharge",
  "cashRegisterShift", "saleItem", "customerFollowup", "storeSettings",
  "commissionRule", "commissionCategoryRule", "commissionTier", "salesGoal",
  "fiscalQueue", "fiscalEvent", "fiscalSequence", "exchange", "exchangeItem",
  "voucher", "voucherUsage", "delivery",
] as const;

async function main() {
  console.log("Backfill: ensuring Tenant #1 exists...");
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_1.slug },
    update: {},
    create: { name: TENANT_1.name, slug: TENANT_1.slug },
  });
  console.log(`  Tenant #1 = ${tenant.id} (${tenant.slug})`);

  for (const model of MODELS) {
    // @ts-expect-error dynamic model access by name
    const res = await prisma[model].updateMany({
      where: { tenant_id: null },
      data: { tenant_id: tenant.id },
    });
    console.log(`  ${model}: ${res.count} rows assigned`);
  }
  console.log("Backfill complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
