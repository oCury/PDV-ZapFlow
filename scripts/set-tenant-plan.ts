// Usage: npm run tenant:set-plan -- --slug <slug> --plan <basic|pro|enterprise>
// Changes an existing tenant's plan. Takes effect immediately (plan is read
// fresh per request) — no redeploy needed.
import { PrismaClient } from "@prisma/client";
import { PLANS } from "../src/lib/entitlements";

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("--slug");
  const planArg = arg("--plan")?.toLowerCase();

  if (!slug || !planArg) {
    console.error("Required: --slug <slug> --plan <basic|pro|enterprise>");
    process.exit(1);
  }
  if (!(PLANS as readonly string[]).includes(planArg)) {
    console.error(`Invalid --plan "${planArg}". Use one of: ${PLANS.join(", ")}`);
    process.exit(1);
  }
  const plan = planArg as (typeof PLANS)[number];

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { plan: true },
  });
  if (!tenant) {
    console.error(`No tenant with slug "${slug}".`);
    process.exit(1);
  }

  const updated = await prisma.tenant.update({
    where: { slug },
    data: { plan },
    select: { slug: true, plan: true },
  });

  console.log(`Tenant ${updated.slug}: ${tenant.plan ?? "(unset)"} -> ${updated.plan}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
