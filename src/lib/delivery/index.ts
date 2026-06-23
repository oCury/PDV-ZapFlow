import type { DeliveryCarrier } from "./types";
import { manualCarrier } from "./manual";
import { ninetyNineCarrier } from "./ninetynine";

export * from "./types";

const CARRIERS: Record<string, DeliveryCarrier> = {
  MANUAL: manualCarrier,
  MOTOBOY: manualCarrier, // motoboy is operator-handled in v1
  CORREIOS: manualCarrier, // tracking entered manually in v1
  TRANSPORTADORA: manualCarrier,
  NINETYNINE: ninetyNineCarrier,
};

/** Returns the carrier adapter for a carrier code, defaulting to manual. */
export function getCarrier(name?: string | null): DeliveryCarrier {
  if (!name) return manualCarrier;
  return CARRIERS[name.toUpperCase()] ?? manualCarrier;
}
