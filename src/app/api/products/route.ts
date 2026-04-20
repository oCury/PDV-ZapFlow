import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const categoryId = searchParams.get("category_id");
  const search = searchParams.get("search");
  const includeVariants = searchParams.get("variants") !== "false";

  const where: Prisma.ProductWhereInput = {};

  if (category) {
    where.category = category;
  }

  if (categoryId) {
    where.category_id = categoryId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      barcode: true,
      sell_price: true,
      cost_price: true,
      stock_quantity: true,
      min_stock: true,
      category: true,
      category_id: true,
      has_variants: true,
      image_url: true,
      variants: includeVariants
        ? {
            where: { active: true },
            orderBy: [{ size: "asc" }, { color: "asc" }],
            select: {
              id: true,
              sku: true,
              size: true,
              color: true,
              model: true,
              barcode: true,
              stock_quantity: true,
              min_stock: true,
              cost_price: true,
              sell_price: true,
              image_url: true,
              active: true,
            },
          }
        : false,
    },
  });

  return NextResponse.json(
    products.map((p) => ({
      ...p,
      sell_price: Number(p.sell_price),
      cost_price: Number(p.cost_price),
      variants: includeVariants && p.variants
        ? p.variants.map((v) => ({
            ...v,
            cost_price: v.cost_price ? Number(v.cost_price) : null,
            sell_price: v.sell_price ? Number(v.sell_price) : null,
          }))
        : undefined,
    }))
  );
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, barcode, cost_price, sell_price, stock_quantity, min_stock, category, category_id, image_url } = body;

    if (!name || !barcode || sell_price == null || !category) {
      return NextResponse.json(
        { error: "Campos obrigatórios: name, barcode, sell_price, category" },
        { status: 400 }
      );
    }

    const existing = await prisma.product.findUnique({ where: { barcode } });
    if (existing) {
      return NextResponse.json(
        { error: "Já existe um produto com este código de barras." },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name,
        barcode,
        cost_price: cost_price ?? 0,
        sell_price,
        stock_quantity: stock_quantity ?? 0,
        min_stock: min_stock ?? 0,
        category,
        category_id: category_id || null,
        image_url: image_url || null,
      },
    });

    return NextResponse.json(
      { ...product, sell_price: Number(product.sell_price), cost_price: Number(product.cost_price) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Erro interno ao criar produto." },
      { status: 500 }
    );
  }
}
