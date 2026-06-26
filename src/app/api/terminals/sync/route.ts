import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant/context";
import { listDevices, setOperatingMode } from "@/lib/mercadopago/devices";
import { mapMpErrorToOperatorMessage } from "@/lib/mercadopago/errors";

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso negado." }, { status: 403 });

  try {
    const devices = await listDevices();
    const tenantId = getTenantId();
    for (const device of devices) {
      await setOperatingMode(device.id, "PDV").catch(() => {});
      await prisma.paymentTerminal.upsert({
        where: { tenant_id_mp_device_id: { tenant_id: tenantId, mp_device_id: device.id } },
        update: { operating_mode: "PDV", last_seen_at: new Date(), status: "ONLINE" },
        create: { name: device.id, mp_device_id: device.id, operating_mode: "PDV", status: "ONLINE" },
      });
    }
    const terminals = await prisma.paymentTerminal.findMany({ orderBy: { created_at: "asc" } });
    return NextResponse.json({ synced: devices.length, terminals });
  } catch (err) {
    const op = mapMpErrorToOperatorMessage(err);
    return NextResponse.json({ error: op.message, code: op.code }, { status: 502 });
  }
}
