import { basePrisma } from "@/lib/prisma";
import type { Plan } from "@/lib/entitlements";

/** Find a free slug, appending -2, -3, ... on collision. Uses basePrisma (unscoped). */
export async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; ; n++) {
    const hit = await basePrisma.tenant.findFirst({ where: { slug: candidate }, select: { id: true } });
    if (!hit) return candidate;
    candidate = `${base}-${n}`;
  }
}

export interface ProvisionInput {
  name: string; slugBase: string; email: string; passwordHash: string; plan: Plan; trialEndsAt: Date | null;
}

/** Atomically create a tenant + its admin user. Returns ids. Caller pre-hashes the password. */
export async function createTenantWithAdmin(i: ProvisionInput): Promise<{ tenantId: string; slug: string; userId: string }> {
  // NOTE: uniqueSlug probes outside the transaction; concurrent same-name signups
  // could collide, but the slug @unique index makes the loser fail safely (P2002), not corrupt data.
  const slug = await uniqueSlug(i.slugBase);
  return basePrisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: i.name, slug, plan: i.plan, trial_ends_at: i.trialEndsAt } });
    const user = await tx.user.create({ data: { name: "Administrador", email: i.email, password: i.passwordHash, role: "ADMIN", tenant_id: tenant.id } });
    return { tenantId: tenant.id, slug: tenant.slug, userId: user.id };
  });
}
