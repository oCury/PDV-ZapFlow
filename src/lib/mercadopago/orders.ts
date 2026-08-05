import { mpFetch } from "./client";
import { toAmountString, methodToMpType } from "./amount";
import type { TerminalChargeMethod } from "@prisma/client";

export interface CreateTerminalOrderInput {
  terminalDeviceId: string;
  amount: number;
  method: TerminalChargeMethod;
  installments: number;
  externalRef: string;
}

export interface MpOrder {
  id: string;
  status?: string;
  status_detail?: string;
  transactions?: { payments?: { id?: string; status?: string }[] };
}

export async function createTerminalOrder(
  input: CreateTerminalOrderInput,
  accessToken?: string,
): Promise<MpOrder> {
  const amount = toAmountString(input.amount);
  const body = {
    type: "point",
    external_reference: input.externalRef,
    total_amount: amount,
    config: { point: { terminal_id: input.terminalDeviceId, print_on_terminal: true } },
    transactions: {
      payments: [
        {
          amount,
          payment_method: {
            type: methodToMpType(input.method),
            ...(input.method === "CREDIT" ? { installments: input.installments } : {}),
          },
        },
      ],
    },
  };
  return (await mpFetch("/v1/orders", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: input.externalRef,
    accessToken,
  })) as MpOrder;
}

export async function getOrder(orderId: string, accessToken?: string): Promise<MpOrder> {
  return (await mpFetch(`/v1/orders/${orderId}`, { accessToken })) as MpOrder;
}

export async function cancelOrder(orderId: string, accessToken?: string): Promise<MpOrder> {
  return (await mpFetch(`/v1/orders/${orderId}/cancel`, { method: "POST", accessToken })) as MpOrder;
}
