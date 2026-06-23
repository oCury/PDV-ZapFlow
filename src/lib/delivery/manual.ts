import type { DeliveryCarrier } from "./types";

/**
 * Manual carrier — the store operator physically arranges delivery (own motoboy,
 * walk-in handoff, etc.). There is no external system to call, so dispatch/cancel
 * are no-op successes and status is whatever the operator set in the UI.
 *
 * This is the default and only live carrier in v1.
 */
export const manualCarrier: DeliveryCarrier = {
  name: "MANUAL",

  async quote() {
    // No automated quote for manual handling; the operator enters the fee.
    return { success: true, data: { fee: 0 } };
  },

  async dispatch() {
    return { success: true, data: {} };
  },

  async getStatus() {
    // Manual deliveries have no external status source; the stored value is canonical.
    return {
      success: false,
      error: "Entrega manual não possui rastreio automático.",
    };
  },

  async cancel() {
    return { success: true };
  },
};
