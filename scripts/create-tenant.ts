// Usage: npm run tenant:create -- --name "Loja X" --slug loja-x --email admin@lojax.com --password secret123
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

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

  const tenant = await prisma.tenant.create({ data: { name, slug } });
  const user = await prisma.user.create({
    data: {
      name: "Administrador",
      email,
      password: hashPassword(password),
      role: "ADMIN",
      tenant_id: tenant.id,
    },
  });

  console.log(`Tenant ${tenant.slug} (${tenant.id})`);
  console.log(`Admin ${user.email} (${user.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
