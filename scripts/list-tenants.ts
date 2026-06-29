// Usage: npm run tenant:list
// Lists all tenants with their plan and active-user count.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true, plan: true, active: true },
    orderBy: { created_at: "asc" },
  });

  if (tenants.length === 0) {
    console.log("No tenants found.");
    return;
  }

  const rows = await Promise.all(
    tenants.map(async (t) => ({
      slug: t.slug,
      name: t.name,
      plan: t.plan ?? "(unset→basic)",
      active: t.active,
      users: await prisma.user.count({ where: { tenant_id: t.id, active: true } }),
    }))
  );

  console.table(rows);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
