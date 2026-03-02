"use client";

import type { CartItem } from "@/lib/validations/pos";

interface ReceiptPrintProps {
  items: CartItem[];
  total: number;
  payments?: { method: string; amount: number }[];
  change?: number;
  customerName?: string;
  saleId?: string;
  printedAt?: Date;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  CARD: "Cartão",
  PIX: "PIX",
};

export function ReceiptPrint({
  items,
  total,
  payments = [],
  change = 0,
  customerName,
  saleId,
  printedAt = new Date(),
}: ReceiptPrintProps) {
  const dateStr = printedAt.toLocaleString("pt-BR");

  return (
    <div className="print-receipt hidden print:block" style={{ width: "80mm" }}>
      <div className="text-center font-bold text-lg mb-2">PDV ZapFlow</div>
      <div className="text-center text-sm mb-4">{dateStr}</div>
      {saleId && (
        <div className="text-xs mb-2">Venda #{saleId.slice(-8)}</div>
      )}
      {customerName && (
        <div className="text-sm mb-2">Cliente: {customerName}</div>
      )}
      <hr className="border-black my-2" />
      {items.map((item) => (
        <div key={item.id} className="flex justify-between text-sm">
          <span>
            {item.quantity}x {item.name}
          </span>
          <span>R$ {(item.quantity * item.unit_price).toFixed(2)}</span>
        </div>
      ))}
      <hr className="border-black my-2" />
      <div className="flex justify-between font-bold">
        <span>TOTAL</span>
        <span>R$ {total.toFixed(2)}</span>
      </div>
      {payments.length > 0 && (
        <>
          {payments.map((p, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span>{METHOD_LABELS[p.method] || p.method}</span>
              <span>R$ {p.amount.toFixed(2)}</span>
            </div>
          ))}
        </>
      )}
      {change > 0 && (
        <div className="text-sm mt-2">Troco: R$ {change.toFixed(2)}</div>
      )}
      <hr className="border-black my-2" />
      <div className="text-center text-xs mt-4">Obrigado pela preferência!</div>
    </div>
  );
}
