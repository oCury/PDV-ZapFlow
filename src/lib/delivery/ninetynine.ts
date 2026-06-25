import type { DeliveryCarrier } from "./types";

/**
 * 99 CORP API adapter — STUB (not yet active).
 *
 * 99 offers parcel delivery through its corporate API, but it requires a 99
 * Empresas contract + provisioned credentials, and 99's delivery product
 * availability in Brazil is uncertain as of June 2026. Until a contract exists,
 * every method returns a "não configurada" error so the UI degrades gracefully.
 *
 * When wiring the real integration:
 *   Base URL : https://api-corp.99app.com/v2
 *   Auth     : header `x-api-key: <token>`  (store in env, e.g. NINETYNINE_API_KEY)
 *   Quote    : GET  /rides/estimate/{employeeId}
 *   Dispatch : POST /rides  with category `delivery99` | `delivery-moto99`
 *              and `receiver.name` / `receiver.phone`
 *   Status   : webhook for ride status + driver location (configure via PUT /webhook)
 *   Cancel   : ride cancellation endpoint
 * Docs: https://github.com/99Taxis/corp-api-v2-documentation
 */
const NOT_CONFIGURED = {
  success: false as const,
  error: "Integração 99 não configurada.",
};

export const ninetyNineCarrier: DeliveryCarrier = {
  name: "NINETYNINE",

  async quote() {
    return NOT_CONFIGURED;
  },

  async dispatch() {
    return NOT_CONFIGURED;
  },

  async getStatus() {
    return NOT_CONFIGURED;
  },

  async cancel() {
    return NOT_CONFIGURED;
  },
};
