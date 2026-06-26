import { NextRequest, NextResponse } from "next/server";
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
 * GET /api/categories/[id] - Single category with children and product count
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
      children: {
        where: { active: true },
        orderBy: [{ sort_order: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { products: true } },
        },
      },
    },
  });

  if (!category) {
    return NextResponse.json(
      { error: "Categoria não encontrada." },
      { status: 404 }
    );
  }

  return NextResponse.json(category);
}

/**
 * PUT /api/categories/[id] - Update category (ADMIN only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, slug, parent_id, image_url, sort_order, active } = body;

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    if (parent_id === id) {
      return NextResponse.json(
        { error: "Uma categoria não pode ser pai de si mesma." },
        { status: 400 }
      );
    }

    const finalSlug = slug
      ? slugify(slug)
      : name
        ? slugify(name)
        : undefined;

    if (finalSlug && finalSlug !== existing.slug) {
      const slugTaken = await prisma.category.findFirst({
        where: { slug: finalSlug },
      });
      if (slugTaken) {
        return NextResponse.json(
          { error: "Já existe uma categoria com este slug." },
          { status: 409 }
        );
      }
    }

    if (parent_id !== undefined && parent_id !== null) {
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

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(finalSlug !== undefined && { slug: finalSlug }),
        ...(parent_id !== undefined && { parent_id: parent_id || null }),
        ...(image_url !== undefined && { image_url: image_url || null }),
        ...(sort_order !== undefined && { sort_order }),
        ...(active !== undefined && { active }),
      },
    });

    return NextResponse.json(category);
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
      { error: "Erro ao atualizar categoria." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/categories/[id] - Delete category (ADMIN only)
 * Fails if category has products or children.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const { id } = await params;

    const existing = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, children: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Categoria não encontrada." },
        { status: 404 }
      );
    }

    if (existing._count.products > 0) {
      return NextResponse.json(
        {
          error: `Categoria possui ${existing._count.products} produto(s) vinculado(s). Não é possível excluir.`,
        },
        { status: 409 }
      );
    }

    if (existing._count.children > 0) {
      return NextResponse.json(
        {
          error: `Categoria possui ${existing._count.children} subcategoria(s). Não é possível excluir.`,
        },
        { status: 409 }
      );
    }

    await prisma.category.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Erro ao excluir categoria." },
      { status: 500 }
    );
  }
}
