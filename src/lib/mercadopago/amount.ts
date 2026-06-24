import type { TerminalChargeMethod } from "@prisma/client";

/** Min installment value enforced by Mercado Pago: R$5,00. */
export const MIN_INSTALLMENT_VALUE = 5;

/** Reais number → MP decimal string, e.g. 12.3 → "12.30". */
export function toAmountString(reais: number): string {
  return (Math.round(reais * 100) / 100).toFixed(2);
}

export function methodToMpType(
  method: TerminalChargeMethod
): "credit_card" | "debit_card" | "pix" {
  switch (method) {
    case "CREDIT":
      return "credit_card";
    case "DEBIT":
      return "debit_card";
    case "PIX":
      return "pix";
  }
}

export type InstallmentCheck =
  | { ok: true }
  | { ok: false; reason: "MAX_EXCEEDED" | "MIN_PARCELA" };

export function validateInstallments(
  amount: number,
  installments: number,
  maxInstallments: number
): InstallmentCheck {
  if (installments < 1) return { ok: false, reason: "MIN_PARCELA" };
  if (installments > maxInstallments) return { ok: false, reason: "MAX_EXCEEDED" };
  if (installments > 1 && amount / installments < MIN_INSTALLMENT_VALUE) {
    return { ok: false, reason: "MIN_PARCELA" };
  }
  return { ok: true };
}
