import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encryptJson } from "@/lib/crypto/secretbox";
import { requireAdmin } from "@/lib/auth";

const upsertSchema = z.object({
  provider: z.enum(["mercadopago", "stone", "connecttef"]),
  mode: z.enum(["sandbox", "live"]).default("sandbox"),
  credentials: z.record(z.string(), z.unknown()),
  externalAccountId: z.string().optional(),
});

/**
 * GET /api/settings/providers
 * Lists all provider connections for the current tenant.
 * Credentials are NEVER included in the response.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const rows = await prisma.providerConnection.findMany();

  return NextResponse.json(
    rows.map((r) => ({
      provider: r.provider,
      mode: r.mode,
      status: r.status,
      externalAccountId: r.external_account_id,
    })),
  );
}

/**
 * POST /api/settings/providers
 * Upserts a provider connection for the current tenant.
 * Credentials are encrypted before storage and never returned.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const parsed = upsertSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const input = parsed.data;
  const status = input.mode === "live" ? "live" : "sandbox";

  const data = {
    mode: input.mode,
    status,
    credentials: encryptJson(input.credentials),
    external_account_id: input.externalAccountId ?? null,
  } as const;

  // findFirst lets the tenant-scoped prisma client inject tenant_id automatically.
  const existing = await prisma.providerConnection.findFirst({
    where: { provider: input.provider },
  });

  if (existing) {
    await prisma.providerConnection.update({ where: { id: existing.id }, data });
  } else {
    // tenant_id is required in the schema but injected at runtime by the
    // tenant-scoped prisma extension (scope.ts case "create"). Cast to bypass
    // the TS type check that doesn't see the middleware injection.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.providerConnection.create({
      data: { provider: input.provider, ...data } as any,
    });
  }

  return NextResponse.json({ ok: true });
}
