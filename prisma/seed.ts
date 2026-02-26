import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const products = [
  {
    name: "Coca-Cola 350ml",
    barcode: "7891000051120",
    cost_price: 2.5,
    sell_price: 5.0,
    stock_quantity: 50,
    category: "Beverages",
    image_url: null,
  },
  {
    name: "Chocolate Bis Extra",
    barcode: "7891045041049",
    cost_price: 3.0,
    sell_price: 6.5,
    stock_quantity: 50,
    category: "Snacks",
    image_url: null,
  },
  {
    name: "Mouse Pad Gamer",
    barcode: "7898554984512",
    cost_price: 15.0,
    sell_price: 45.0,
    stock_quantity: 50,
    category: "Electronics",
    image_url: null,
  },
  {
    name: "Energético Monster",
    barcode: "7084701235481",
    cost_price: 5.0,
    sell_price: 12.0,
    stock_quantity: 50,
    category: "Beverages",
    image_url: null,
  },
  {
    name: "Cabo USB-C 1m",
    barcode: "6971596342154",
    cost_price: 8.0,
    sell_price: 25.0,
    stock_quantity: 50,
    category: "Accessories",
    image_url: null,
  },
];

async function main() {
  console.log("Seeding database...\n");

  // Seed admin user
  const adminEmail = "admin@adegailhaabcd.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: "Administrador",
        email: adminEmail,
        password: hashPassword("admin123"),
        role: "ADMIN",
      },
    });
    console.log("  ✓ Admin user created (admin@adegailha.com / admin123)");
  } else {
    console.log("  ● Admin user already exists");
  }

  // Seed products
  for (const product of products) {
    await prisma.product.upsert({
      where: { barcode: product.barcode },
      update: {
        name: product.name,
        cost_price: product.cost_price,
        sell_price: product.sell_price,
        stock_quantity: product.stock_quantity,
        category: product.category,
        image_url: product.image_url,
      },
      create: product,
    });
    console.log(`  ✓ ${product.name} (${product.barcode})`);
  }

  console.log(`\nSeeded ${products.length} products + 1 admin user successfully.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
