import { basePrisma } from "@/lib/prisma";

/** Map MP's collector user_id (from the webhook payload) to our tenant. */
export async function resolveTenantFromUserId(userId: string): Promise<string | null> {
  if (!userId) return null;
  const conn = await basePrisma.mpConnection.findFirst({ where: { mp_user_id: userId } });
  return conn?.tenant_id ?? null;
}
