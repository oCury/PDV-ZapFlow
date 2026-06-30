// Usage: npm run tenant:create -- --name "Loja X" --slug loja-x --email admin@lojax.com --password secret123 --plan <basic|pro|enterprise> (optional, default basic)
import { PLANS } from "../src/lib/entitlements";
import { createTenantWithAdmin } from "../src/lib/tenant/provision";
import { hashPassword } from "../src/lib/auth";
import { basePrisma } from "../src/lib/prisma";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("--name");
  const slug = arg("--slug");
  const email = arg("--email")?.toLowerCase().trim();
  const password = arg("--password");

  if (!name || !slug || !email || !password) {
    console.error("Required: --name <name> --slug <slug> --email <email> --password <password>");
    process.exit(1);
  }

  const planArg = (arg("--plan") ?? "basic").toLowerCase();
  if (!(PLANS as readonly string[]).includes(planArg)) {
    console.error(`Invalid --plan "${planArg}". Use one of: ${PLANS.join(", ")}`);
    process.exit(1);
  }
  const plan = planArg as (typeof PLANS)[number];

  const res = await createTenantWithAdmin({ name, slugBase: slug, email, passwordHash: hashPassword(password), plan, trialEndsAt: null });
  console.log(`Tenant ${res.slug} (${res.tenantId})`);
  console.log(`Admin ${email} (${res.userId})`);
}

main()
  .then(async () => { await basePrisma.$disconnect(); process.exit(0); })
  .catch(async (e) => {
    console.error(e);
    await basePrisma.$disconnect();
    process.exit(1);
  });
