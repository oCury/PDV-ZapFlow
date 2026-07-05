"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CreditCard, Plus, Plug, Unplug } from "lucide-react";

interface Terminal {
  id: string;
  name: string;
  provider: string;
  mp_device_id: string;
  device_external_id: string | null;
  status: "ONLINE" | "OFFLINE" | "BUSY" | "UNKNOWN";
  location_label: string | null;
  is_active: boolean;
}

interface ProviderConnection {
  provider: "mercadopago" | "stone" | "connecttef";
  mode: "sandbox" | "live";
  status: string;
  externalAccountId: string | null;
}

const STATUS_STYLE: Record<Terminal["status"], string> = {
  ONLINE: "bg-brand-green/20 text-brand-green",
  OFFLINE: "bg-red-500/20 text-red-400",
  BUSY: "bg-amber-500/20 text-amber-400",
  UNKNOWN: "bg-slate-600 text-slate-300",
};

const PROVIDER_STATUS_STYLE: Record<string, string> = {
  disconnected: "bg-slate-600 text-slate-300",
  sandbox: "bg-amber-500/20 text-amber-400",
  live: "bg-brand-green/20 text-brand-green",
  error: "bg-red-500/20 text-red-400",
};

const PROVIDER_LABELS: Record<string, string> = {
  mercadopago: "Mercado Pago",
  stone: "Stone",
  connecttef: "ConnectTEF",
};

// Providers that support automatic device sync
const PROVIDER_DEVICE_SYNC: Record<string, boolean> = {
  mercadopago: true,
  stone: false,
  connecttef: false,
};

const ALL_PROVIDERS = ["mercadopago", "stone", "connecttef"] as const;

// Per-provider credential field definitions
const CREDENTIAL_FIELDS: Record<
  string,
  { key: string; label: string; placeholder: string }[]
> = {
  mercadopago: [
    { key: "accessToken", label: "Access Token", placeholder: "APP_USR-..." },
    { key: "mpUserId", label: "MP User ID (opcional)", placeholder: "123456789" },
  ],
  stone: [
    { key: "apiKey", label: "API Key", placeholder: "sk_..." },
    { key: "merchantId", label: "Merchant ID", placeholder: "stone_..." },
  ],
  connecttef: [
    { key: "endpoint", label: "Endpoint", placeholder: "http://localhost:60906" },
    { key: "agentToken", label: "Agent Token", placeholder: "..." },
    { key: "merchantId", label: "Merchant ID", placeholder: "..." },
  ],
};

function getExternalAccountId(
  provider: string,
  creds: Record<string, string>,
): string | undefined {
  if (provider === "mercadopago") return creds.mpUserId || undefined;
  if (provider === "stone") return creds.merchantId || undefined;
  if (provider === "connecttef") return creds.merchantId || undefined;
  return undefined;
}

function getCredentialsPayload(
  provider: string,
  creds: Record<string, string>,
): Record<string, string> {
  if (provider === "mercadopago") return { accessToken: creds.accessToken ?? "" };
  if (provider === "stone")
    return { apiKey: creds.apiKey ?? "", merchantId: creds.merchantId ?? "" };
  if (provider === "connecttef")
    return {
      endpoint: creds.endpoint ?? "",
      agentToken: creds.agentToken ?? "",
      merchantId: creds.merchantId ?? "",
    };
  return {};
}

function ProviderCard({
  provider,
  connection,
  onRefresh,
}: {
  provider: (typeof ALL_PROVIDERS)[number];
  connection: ProviderConnection | undefined;
  onRefresh: () => void;
}) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const status = connection?.status ?? "disconnected";
  const isConnected = status !== "disconnected";
  const fields = CREDENTIAL_FIELDS[provider];

  async function connect() {
    setSaving(true);
    setFormError(null);
    const credentials = getCredentialsPayload(provider, creds);
    const externalAccountId = getExternalAccountId(provider, creds);
    const res = await fetch("/api/settings/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        mode: "sandbox",
        credentials,
        ...(externalAccountId ? { externalAccountId } : {}),
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setFormError(d.error || "Falha ao salvar.");
    } else {
      setCreds({});
      onRefresh();
    }
    setSaving(false);
  }

  async function disconnect() {
    if (!confirm(`Desconectar ${PROVIDER_LABELS[provider]}?`)) return;
    setDisconnecting(true);
    await fetch(`/api/settings/providers/${provider}`, { method: "DELETE" });
    setDisconnecting(false);
    onRefresh();
  }

  async function toggleMode() {
    if (!connection) return;
    setToggling(true);
    const nextMode = connection.mode === "sandbox" ? "live" : "sandbox";
    await fetch(`/api/settings/providers/${provider}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: nextMode }),
    });
    setToggling(false);
    onRefresh();
  }

  return (
    <li className="p-4 rounded-2xl bg-slate-800 border border-slate-700 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{PROVIDER_LABELS[provider]}</span>
        <span
          className={`px-2 py-1 rounded-lg text-xs font-semibold ${PROVIDER_STATUS_STYLE[status] ?? PROVIDER_STATUS_STYLE.disconnected}`}
        >
          {status}
        </span>
      </div>

      {isConnected && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleMode}
            disabled={toggling}
            className="touch-target min-h-[36px] px-3 flex items-center gap-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-medium disabled:opacity-60"
          >
            {toggling ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Plug size={13} />
            )}
            Modo: {connection?.mode === "sandbox" ? "sandbox → live" : "live → sandbox"}
          </button>
          <button
            type="button"
            onClick={disconnect}
            disabled={disconnecting}
            className="touch-target min-h-[36px] px-3 flex items-center gap-1.5 rounded-lg bg-red-800/40 hover:bg-red-700/50 text-red-300 text-xs font-medium disabled:opacity-60"
          >
            {disconnecting ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Unplug size={13} />
            )}
            Desconectar
          </button>
        </div>
      )}

      {!isConnected && (
        <div className="space-y-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="block text-xs text-slate-400">{f.label}</label>
              <input
                type="text"
                placeholder={f.placeholder}
                value={creds[f.key] ?? ""}
                onChange={(e) =>
                  setCreds((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-green"
              />
            </div>
          ))}
          {formError && <p className="text-red-400 text-xs">{formError}</p>}
          <button
            type="button"
            onClick={connect}
            disabled={saving}
            className="touch-target min-h-[36px] px-4 flex items-center gap-2 rounded-lg bg-brand-green hover:bg-brand-green-hover text-primary-dark text-xs font-semibold disabled:opacity-60"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Plug size={13} />}
            Conectar
          </button>
        </div>
      )}
    </li>
  );
}

export default function TerminalsSettingsPage() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [providers, setProviders] = useState<ProviderConnection[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-terminal form state
  const [addName, setAddName] = useState("");
  const [addDeviceId, setAddDeviceId] = useState("");
  const [addProvider, setAddProvider] = useState<string>("mercadopago");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function loadTerminals() {
    const res = await fetch("/api/terminals");
    if (res.ok) setTerminals((await res.json()).terminals);
  }

  async function loadProviders() {
    const res = await fetch("/api/settings/providers");
    if (res.ok) setProviders(await res.json());
  }

  useEffect(() => {
    loadTerminals();
    loadProviders();
  }, []);

  async function sync() {
    setSyncing(true);
    setError(null);
    const res = await fetch("/api/terminals/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Falha ao sincronizar.");
    else setTerminals(data.terminals);
    setSyncing(false);
  }

  async function addTerminal(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/terminals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addName,
        deviceExternalId: addDeviceId,
        provider: addProvider,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setAddError(d.error || "Falha ao adicionar.");
    } else {
      setAddName("");
      setAddDeviceId("");
      setAddProvider("mercadopago");
      await loadTerminals();
    }
    setAdding(false);
  }

  function findConnection(provider: string) {
    return providers.find((p) => p.provider === provider);
  }

  return (
    <main className="min-h-screen bg-primary-dark text-white p-6">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* ── Providers panel ── */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold">Provedores de pagamento</h2>
          <ul className="space-y-3">
            {ALL_PROVIDERS.map((p) => (
              <ProviderCard
                key={p}
                provider={p}
                connection={findConnection(p)}
                onRefresh={loadProviders}
              />
            ))}
          </ul>
        </section>

        {/* ── Terminals header ── */}
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

        {/* ── Terminal list ── */}
        {terminals.length === 0 ? (
          <p className="text-slate-400">
            Nenhuma maquininha vinculada. Conecte o dispositivo e clique em
            &quot;Sincronizar dispositivos&quot; (Mercado Pago) ou adicione manualmente abaixo.
          </p>
        ) : (
          <ul className="space-y-3">
            {terminals.map((t) => (
              <li key={t.id} className="p-4 rounded-2xl bg-slate-800 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{t.name}</p>
                      <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-300 font-mono">
                        {t.provider}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono">
                      {t.device_external_id ?? t.mp_device_id}
                    </p>
                    {t.location_label && (
                      <p className="text-xs text-slate-400">{t.location_label}</p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 rounded-lg text-xs font-semibold ${STATUS_STYLE[t.status]}`}
                  >
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

        {/* ── Add terminal manually (for non-syncing providers) ── */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-300">
            Adicionar maquininha manualmente
          </h2>
          <p className="text-xs text-slate-500">
            Use para Stone e ConnectTEF, que não possuem sincronização automática.
          </p>
          <form onSubmit={addTerminal} className="p-4 rounded-2xl bg-slate-800 border border-slate-700 space-y-3">
            <div className="space-y-1">
              <label className="block text-xs text-slate-400">Nome</label>
              <input
                type="text"
                required
                placeholder="Caixa 1"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-green"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-slate-400">ID do dispositivo</label>
              <input
                type="text"
                required
                placeholder="PAX-00001 / stone_pos_xxx"
                value={addDeviceId}
                onChange={(e) => setAddDeviceId(e.target.value)}
                className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-brand-green"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-slate-400">Provedor</label>
              <select
                value={addProvider}
                onChange={(e) => setAddProvider(e.target.value)}
                className="w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-green"
              >
                {ALL_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                    {PROVIDER_DEVICE_SYNC[p] ? " (sync automático)" : ""}
                  </option>
                ))}
              </select>
            </div>
            {addError && <p className="text-red-400 text-xs">{addError}</p>}
            <button
              type="submit"
              disabled={adding}
              className="touch-target min-h-[40px] px-4 flex items-center gap-2 rounded-lg bg-brand-green hover:bg-brand-green-hover text-primary-dark text-sm font-semibold disabled:opacity-60"
            >
              {adding ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
              Adicionar maquininha
            </button>
          </form>
        </section>

      </div>
    </main>
  );
}
