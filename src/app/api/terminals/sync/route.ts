import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listDevices, setOperatingMode } from "@/lib/mercadopago/devices";
import { mapMpErrorToOperatorMessage } from "@/lib/mercadopago/errors";

export async function POST() {
  try {
    const devices = await listDevices();
    for (const device of devices) {
      await setOperatingMode(device.id, "PDV").catch(() => {});
      await prisma.paymentTerminal.upsert({
        where: { mp_device_id: device.id },
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
