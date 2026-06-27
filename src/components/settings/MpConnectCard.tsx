"use client";

import { useEffect, useState } from "react";

type Status = { connected: boolean; mpUserId?: string; liveMode?: boolean };

export function MpConnectCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/mp/connection")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  async function disconnect() {
    setBusy(true);
    await fetch("/api/mp/connection", { method: "DELETE" });
    setStatus({ connected: false });
    setBusy(false);
  }

  return (
    <section
      aria-labelledby="mp-connect-heading"
      className="p-4 rounded-2xl bg-slate-800 border border-slate-700"
    >
      <h2 id="mp-connect-heading" className="font-semibold text-white">
        Mercado Pago
      </h2>

      {status === null ? (
        <p className="mt-2 text-sm text-slate-400">Carregando…</p>
      ) : status.connected ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-300">
            Conectado
            {status.mpUserId ? ` (conta ${status.mpUserId})` : ""}
            {status.liveMode === false ? " — modo teste" : ""}.
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="touch-target min-h-[40px] px-3 flex items-center gap-2 rounded-lg bg-slate-600 hover:bg-slate-500 text-sm disabled:opacity-50"
          >
            {busy ? "Desconectando…" : "Desconectar"}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-400">
            Conecte sua conta Mercado Pago para usar sua própria maquininha.
          </p>
          <a
            href="/api/mp/oauth/start"
            className="touch-target min-h-[40px] inline-flex items-center px-4 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold text-sm"
          >
            Conectar Mercado Pago
          </a>
        </div>
      )}
    </section>
  );
}
