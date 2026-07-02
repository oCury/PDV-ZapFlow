"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CreditCard } from "lucide-react";

interface Terminal {
  id: string;
  name: string;
  mp_device_id: string;
  status: "ONLINE" | "OFFLINE" | "BUSY" | "UNKNOWN";
  location_label: string | null;
  is_active: boolean;
}

const STATUS_STYLE: Record<Terminal["status"], string> = {
  ONLINE: "bg-brand-green/20 text-brand-green",
  OFFLINE: "bg-red-500/20 text-red-400",
  BUSY: "bg-amber-500/20 text-amber-400",
  UNKNOWN: "bg-slate-600 text-slate-300",
};

export default function TerminalsSettingsPage() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/terminals");
    if (res.ok) setTerminals((await res.json()).terminals);
  }
  useEffect(() => { load(); }, []);

  async function sync() {
    setSyncing(true);
    setError(null);
    const res = await fetch("/api/terminals/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Falha ao sincronizar.");
    else setTerminals(data.terminals);
    setSyncing(false);
  }

  return (
    <main className="min-h-screen bg-primary-dark text-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Maquininhas</h1>
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            className="touch-target min-h-[44px] px-4 flex items-center gap-2 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold disabled:opacity-60"
          >
            <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
            Sincronizar dispositivos
          </button>
        </header>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {terminals.length === 0 ? (
          <p className="text-slate-400">
            Nenhuma maquininha vinculada. Conecte o dispositivo à conta Mercado Pago e clique em
            &quot;Sincronizar dispositivos&quot;.
          </p>
        ) : (
          <ul className="space-y-3">
            {terminals.map((t) => (
              <li key={t.id} className="p-4 rounded-2xl bg-slate-800 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{t.mp_device_id}</p>
                    {t.location_label && (
                      <p className="text-xs text-slate-400">{t.location_label}</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${STATUS_STYLE[t.status]}`}>
                    {t.status}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Cobrar R$1,00 de teste em ${t.name}?`)) return;
                      const res = await fetch("/api/checkout/terminal-charge", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          terminalId: t.id,
                          method: "DEBIT",
                          installments: 1,
                          totalAmount: 1,
                          items: [{ productId: "TEST", quantity: 1, unitPrice: 1 }],
                        }),
                      });
                      if (!res.ok) {
                        const d = await res.json();
                        alert(d.error || "Falha no teste.");
                      } else {
                        alert("Cobrança enviada à maquininha. Conclua no dispositivo.");
                      }
                    }}
                    className="touch-target min-h-[40px] px-3 flex items-center gap-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm"
                  >
                    <CreditCard size={16} />
                    Teste de cobrança R$1,00
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
