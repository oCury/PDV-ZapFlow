import type { TerminalDriver } from "./types";
import type { TerminalProviderName } from "@prisma/client";
import { mercadoPagoDriver } from "./drivers/mercadopago";
import { stoneDriver } from "./drivers/stone";
import { connectTefDriver } from "./drivers/connecttef";
import { sandboxDriver } from "./drivers/sandbox";

const REAL: Record<TerminalProviderName, TerminalDriver> = {
  mercadopago: mercadoPagoDriver,
  stone: stoneDriver,
  connecttef: connectTefDriver,
};

export function resolveDriver(conn: { provider: TerminalProviderName; mode: "sandbox" | "live" }): TerminalDriver {
  return conn.mode === "live" ? REAL[conn.provider] : sandboxDriver(conn.provider);
}
