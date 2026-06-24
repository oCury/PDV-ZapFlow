"use client";

import { useEffect, useState } from "react";
import { CreditCard, Landmark, QrCode } from "lucide-react";

interface Terminal { id: string; name: string; is_active: boolean; status: string; }
type Method = "CREDIT" | "DEBIT" | "PIX";

const METHODS: { key: Method; label: string; icon: typeof CreditCard }[] = [
  { key: "CREDIT", label: "Crédito", icon: CreditCard },
  { key: "DEBIT", label: "Débito", icon: Landmark },
  { key: "PIX", label: "PIX", icon: QrCode },
];

export function TerminalPaymentPanel({
  totalAmount,
  onSend,
}: {
  totalAmount: number;
  onSend: (args: { terminalId: string; method: Method; installments: number }) => void;
}) {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalId, setTerminalId] = useState<string>("");
  const [method, setMethod] = useState<Method>("CREDIT");
  const [installments, setInstallments] = useState(1);
  const [maxInstallments, setMaxInstallments] = useState(1);

  useEffect(() => {
    fetch("/api/terminals").then(async (r) => {
      if (r.ok) {
        const list: Terminal[] = (await r.json()).terminals.filter((t: Terminal) => t.is_active);
        setTerminals(list);
        if (list[0]) setTerminalId(list[0].id);
      }
    });
    fetch("/api/settings").then(async (r) => {
      if (r.ok) {
        const data = await r.json();
        const max = parseInt(data?.max_installments ?? "1", 10);
        setMaxInstallments(Number.isFinite(max) && max > 0 ? max : 1);
      }
    });
  }, []);

  const maxByValue = Math.max(1, Math.floor(totalAmount / 5));
  const maxOptions = Math.min(maxInstallments, maxByValue);

  return (
    <div className="space-y-4">
      {terminals.length === 0 ? (
        <p className="text-amber-400 text-sm">
          Nenhuma maquininha vinculada. Configure em Ajustes → Maquininhas.
        </p>
      ) : (
        <>
          {terminals.length > 1 && (
            <select
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl bg-slate-700 text-white px-3"
            >
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => { setMethod(m.key); setInstallments(1); }}
                className={`touch-target min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold ${
                  method === m.key ? "bg-brand-green text-primary-dark" : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                }`}
              >
                <m.icon size={22} />
                {m.label}
              </button>
            ))}
          </div>

          {method === "CREDIT" && maxOptions > 1 && (
            <select
              value={installments}
              onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
              className="w-full min-h-[44px] rounded-xl bg-slate-700 text-white px-3"
            >
              {Array.from({ length: maxOptions }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x de R$ {(totalAmount / n).toFixed(2)}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={!terminalId}
            onClick={() => onSend({ terminalId, method, installments })}
            className="w-full touch-target min-h-[56px] bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 text-primary-dark font-bold text-lg rounded-xl"
          >
            Enviar para maquininha
          </button>
        </>
      )}
    </div>
  );
}
