import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * GET /api/categories - List categories
 * Query params:
 *   ?parent_id=xxx  - filter by parent
 *   ?flat=true      - return flat list without nested children
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parentId = searchParams.get("parent_id");
  const flat = searchParams.get("flat") === "true";

  const where: Prisma.CategoryWhereInput = { active: true };

  if (parentId) {
    where.parent_id = parentId;
  }

  const include = flat
    ? { _count: { select: { products: true } } }
    : {
        _count: { select: { products: true } },
        children: {
          where: { active: true },
          orderBy: [
            { sort_order: "asc" as const },
            { name: "asc" as const },
          ],
          include: {
            _count: { select: { products: true } },
            children: {
              where: { active: true },
              orderBy: [
                { sort_order: "asc" as const },
                { name: "asc" as const },
              ],
              include: {
                _count: { select: { products: true } },
              },
            },
          },
        },
      };

  const categories = await prisma.category.findMany({
    where,
    orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    include,
  });

  return NextResponse.json(categories);
}

/**
 * POST /api/categories - Create category (ADMIN only)
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, slug, parent_id, image_url, sort_order } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Campo obrigatório: name" },
        { status: 400 }
      );
    }

    const finalSlug = slug ? slugify(slug) : slugify(name);

    const existing = await prisma.category.findUnique({
      where: { slug: finalSlug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Já existe uma categoria com este slug." },
        { status: 409 }
      );
    }

    if (parent_id) {
      const parent = await prisma.category.findUnique({
        where: { id: parent_id },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "Categoria pai não encontrada." },
          { status: 404 }
        );
      }
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug: finalSlug,
        parent_id: parent_id || null,
        image_url: image_url || null,
        sort_order: sort_order ?? 0,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Já existe uma categoria com este slug." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Erro interno ao criar categoria." },
      { status: 500 }
    );
  }
}
