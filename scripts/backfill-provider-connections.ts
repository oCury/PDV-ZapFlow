// Backfills existing MP data onto the generalized columns and migrates
// MpConnection tokens into an encrypted ProviderConnection. Idempotent.
import { basePrisma } from "@/lib/prisma";
import { encryptJson } from "@/lib/crypto/secretbox";

async function main() {
  const terminals = await basePrisma.paymentTerminal.findMany({ where: { device_external_id: null } });
  for (const t of terminals) {
    await basePrisma.paymentTerminal.update({
      where: { id: t.id },
      data: { device_external_id: t.mp_device_id, provider: "mercadopago" },
    });
  }
  console.log(`terminals backfilled: ${terminals.length}`);

  const charges = await basePrisma.terminalCharge.findMany({ where: { external_order_id: null } });
  for (const c of charges) {
    await basePrisma.terminalCharge.update({
      where: { id: c.id },
      data: { provider: "mercadopago", external_order_id: c.mp_order_id, external_payment_id: c.mp_payment_id },
    });
  }
  console.log(`charges backfilled: ${charges.length}`);

  const conns = await basePrisma.mpConnection.findMany();
  for (const m of conns) {
    const credentials = encryptJson({
      accessToken: m.access_token,
      refreshToken: m.refresh_token,
      mpUserId: m.mp_user_id,
      publicKey: m.public_key ?? undefined,
    });
    await basePrisma.providerConnection.upsert({
      where: { tenant_id_provider: { tenant_id: m.tenant_id, provider: "mercadopago" } },
      create: {
        tenant_id: m.tenant_id, provider: "mercadopago", credentials,
        mode: m.live_mode ? "live" : "sandbox", status: m.live_mode ? "live" : "sandbox",
        external_account_id: m.mp_user_id,
      },
      update: { credentials, external_account_id: m.mp_user_id },
    });
  }
  console.log(`MP connections migrated: ${conns.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
