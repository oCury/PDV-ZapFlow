import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, string> = {
  followup_days: "15",
  cashback_percent: "10",
  store_name: "Sua Loja",
};

/**
 * Get a single setting by key, returning the default if not set.
 */
export async function getSetting(key: string): Promise<string> {
  const row = await prisma.storeSettings.findUnique({ where: { key } });
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
  await prisma.storeSettings.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getMaxInstallments(): Promise<number> {
  const n = await getNumericSetting("max_installments");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
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
