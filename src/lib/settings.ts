import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant/context";

const DEFAULTS: Record<string, string> = {
  followup_days: "15",
  cashback_percent: "10",
  store_name: "Sua Loja",
};

/**
 * Get a single setting by key, returning the default if not set.
 */
export async function getSetting(key: string): Promise<string> {
  const row = await prisma.storeSettings.findFirst({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

/**
 * Get a numeric setting, returning the parsed default if not set.
 */
export async function getNumericSetting(key: string): Promise<number> {
  const value = await getSetting(key);
  const num = parseFloat(value);
  return isNaN(num) ? parseFloat(DEFAULTS[key] ?? "0") : num;
}

/**
 * Set (upsert) a single setting.
 */
export async function setSetting(key: string, value: string): Promise<void> {
  const tenant_id = getTenantId();
  await prisma.storeSettings.upsert({
    where: { tenant_id_key: { tenant_id, key } },
    update: { value },
    create: { key, value },
  });
}

/**
 * Get all settings as a flat object, merged with defaults.
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.storeSettings.findMany();
  const stored: Record<string, string> = {};
  for (const row of rows) {
    stored[row.key] = row.value;
  }
  return { ...DEFAULTS, ...stored };
}
