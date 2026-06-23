"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Truck,
  RefreshCw,
  Search,
  Package,
  MapPin,
  X,
  Loader2,
  MessageCircle,
  CheckCircle,
  AlertCircle,
  Pencil,
  Send,
} from "lucide-react";

type DeliveryStatus =
  | "PENDING"
  | "READY"
  | "DISPATCHED"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

interface DeliveryRow {
  saleId: string;
  deliveryId: string | null;
  status: DeliveryStatus;
  carrier: string;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  cep: string | null;
  total: number;
  fee: number | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  driverName: string | null;
  driverPhone: string | null;
  notes: string | null;
  channel: string;
  shippingMethod: string | null;
  itemCount: number;
  createdAt: string;
}

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Pendente",
  READY: "Pronto",
  DISPATCHED: "Saiu p/ entrega",
  DELIVERED: "Entregue",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

const STATUS_BADGE: Record<DeliveryStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  READY: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DISPATCHED: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  DELIVERED: "bg-brand-green/15 text-brand-green border-brand-green/30",
  FAILED: "bg-red-500/15 text-red-400 border-red-500/30",
  CANCELLED: "bg-slate-600/30 text-slate-400 border-slate-600",
};

const NEXT_STATUSES: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ["READY", "DISPATCHED", "CANCELLED"],
  READY: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["DELIVERED", "FAILED"],
  FAILED: ["DISPATCHED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const CARRIERS = ["MANUAL", "MOTOBOY", "CORREIOS", "TRANSPORTADORA", "NINETYNINE"];
const CARRIER_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  MOTOBOY: "Motoboy",
  CORREIOS: "Correios",
  TRANSPORTADORA: "Transportadora",
  NINETYNINE: "99 Entregas",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "PENDING", label: "Pendentes" },
  { key: "READY", label: "Prontas" },
  { key: "DISPATCHED", label: "Saiu p/ entrega" },
  { key: "DELIVERED", label: "Entregues" },
  { key: "FAILED", label: "Falhas" },
];

function formatPhone(phone: string | null) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length >= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length >= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

function buildMessage(status: DeliveryStatus, name: string | null) {
  const greeting = name ? `Olá ${name}!` : "Olá!";
  if (status === "DELIVERED")
    return `${greeting} Seu pedido foi entregue ✅. Obrigado pela preferência!`;
  return `${greeting} Seu pedido saiu para entrega 🛵 e chega em breve.`;
}

export default function EntregasPage() {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeliveryRow | null>(null);
  const [whatsappFor, setWhatsappFor] = useState<DeliveryRow | null>(null);

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("status", filter);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/deliveries?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries ?? []);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const updateStatus = async (row: DeliveryRow, status: DeliveryStatus) => {
    setUpdatingId(row.saleId);
    try {
      const res = await fetch(`/api/deliveries/${row.saleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchDeliveries();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Não foi possível atualizar o status.");
      }
    } catch {
      alert("Sem conexão com o servidor.");
    } finally {
      setUpdatingId(null);
    }
  };

  const counts = deliveries.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Truck size={24} className="text-brand-green" />
            Entregas
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {counts} entrega{counts !== 1 ? "s" : ""} · gerencie o envio dos pedidos
          </p>
        </div>
        <button
          onClick={fetchDeliveries}
          disabled={loading}
          className="p-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-400 transition-colors"
          title="Atualizar"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                filter === f.key
                  ? "bg-brand-green text-primary-dark border-brand-green"
                  : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente ou telefone..."
            className="pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green/40 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          <AlertCircle size={18} className="shrink-0" />
          <span>Não foi possível carregar as entregas. Verifique a conexão e tente novamente.</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-2xl p-5 border border-slate-700 animate-pulse h-40"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && deliveries.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <Package size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nenhuma entrega encontrada.</p>
        </div>
      )}

      {/* List */}
      {!loading && deliveries.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {deliveries.map((row) => (
            <DeliveryCard
              key={row.saleId}
              row={row}
              busy={updatingId === row.saleId}
              onAdvance={(s) => updateStatus(row, s)}
              onDetail={() => setDetail(row)}
              onWhatsapp={() => setWhatsappFor(row)}
            />
          ))}
        </div>
      )}

      {detail && (
        <DetailModal
          row={detail}
          onClose={() => setDetail(null)}
          onSaved={() => {
            setDetail(null);
            fetchDeliveries();
          }}
        />
      )}

      {whatsappFor && (
        <WhatsappModal
          row={whatsappFor}
          onClose={() => setWhatsappFor(null)}
        />
      )}
    </div>
  );
}

function DeliveryCard({
  row,
  busy,
  onAdvance,
  onDetail,
  onWhatsapp,
}: {
  row: DeliveryRow;
  busy: boolean;
  onAdvance: (s: DeliveryStatus) => void;
  onDetail: () => void;
  onWhatsapp: () => void;
}) {
  const next = NEXT_STATUSES[row.status];
  return (
    <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-100 truncate">
            {row.customerName || "Cliente não identificado"}
          </p>
          {row.phone && (
            <p className="text-xs text-slate-400">{formatPhone(row.phone)}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_BADGE[row.status]}`}
        >
          {STATUS_LABELS[row.status]}
        </span>
      </div>

      {row.address && (
        <p className="text-sm text-slate-300 flex items-start gap-1.5">
          <MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" />
          <span className="line-clamp-2">
            {row.address}
            {row.cep ? ` — ${row.cep}` : ""}
          </span>
        </p>
      )}

      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
        <span>{CARRIER_LABELS[row.carrier] ?? row.carrier}</span>
        <span>·</span>
        <span>{row.itemCount} item{row.itemCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span className="text-slate-300 font-medium">R$ {row.total.toFixed(2)}</span>
        {row.fee != null && row.fee > 0 && (
          <span className="text-slate-500">(frete R$ {row.fee.toFixed(2)})</span>
        )}
      </div>

      {row.trackingCode && (
        <p className="text-xs text-slate-400">
          Rastreio: <span className="font-mono text-slate-300">{row.trackingCode}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-700/60 mt-1">
        {next.map((s) => (
          <button
            key={s}
            onClick={() => onAdvance(s)}
            disabled={busy}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : null}
            {STATUS_LABELS[s]}
          </button>
        ))}
        <button
          onClick={onWhatsapp}
          className="ml-auto px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand-green/15 hover:bg-brand-green/25 text-brand-green transition-colors flex items-center gap-1"
          title="Avisar cliente no WhatsApp"
        >
          <MessageCircle size={13} />
          WhatsApp
        </button>
        <button
          onClick={onDetail}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors flex items-center gap-1"
        >
          <Pencil size={13} />
          Detalhes
        </button>
      </div>
    </div>
  );
}

function DetailModal({
  row,
  onClose,
  onSaved,
}: {
  row: DeliveryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [carrier, setCarrier] = useState(row.carrier in CARRIER_LABELS ? row.carrier : "MANUAL");
  const [trackingCode, setTrackingCode] = useState(row.trackingCode ?? "");
  const [trackingUrl, setTrackingUrl] = useState(row.trackingUrl ?? "");
  const [driverName, setDriverName] = useState(row.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(row.driverPhone ?? "");
  const [fee, setFee] = useState(row.fee != null ? String(row.fee) : "");
  const [recipientName, setRecipientName] = useState(row.customerName ?? "");
  const [recipientPhone, setRecipientPhone] = useState(row.phone ?? "");
  const [address, setAddress] = useState(row.address ?? "");
  const [cep, setCep] = useState(row.cep ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliveries/${row.saleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier,
          trackingCode: trackingCode.trim() || null,
          trackingUrl: trackingUrl.trim() || null,
          driverName: driverName.trim() || null,
          driverPhone: driverPhone.trim() || null,
          fee: fee.trim() ? Number(fee) : null,
          recipientName: recipientName.trim() || null,
          recipientPhone: recipientPhone.trim() || null,
          address: address.trim() || null,
          cep: cep.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Não foi possível salvar.");
      }
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40";
  const label = "text-xs text-slate-400 mb-1 block";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg border border-slate-600 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800">
          <h2 className="text-lg font-bold text-white">Detalhes da entrega</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className={label}>Transportadora</label>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={field}>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {CARRIER_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Código de rastreio</label>
              <input value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Frete (R$)</label>
              <input
                type="number"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className={field}
              />
            </div>
          </div>
          <div>
            <label className={label}>URL de rastreio</label>
            <input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://..." className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Entregador</label>
              <input value={driverName} onChange={(e) => setDriverName(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Telefone do entregador</label>
              <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Destinatário</label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Telefone</label>
              <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={label}>Endereço</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>CEP</label>
              <input value={cep} onChange={(e) => setCep(e.target.value)} className={field} />
            </div>
          </div>
          <div>
            <label className={label}>Observações</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-slate-700 sticky bottom-0 bg-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:opacity-60 text-primary-dark font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function WhatsappModal({ row, onClose }: { row: DeliveryRow; onClose: () => void }) {
  const [message, setMessage] = useState(buildMessage(row.status, row.customerName));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/deliveries/${row.saleId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: true, text: "Mensagem enviada!" });
      } else {
        setResult({ ok: false, text: data.error || "Falha ao enviar." });
      }
    } catch {
      setResult({ ok: false, text: "Sem conexão com o servidor." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md border border-slate-600">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageCircle size={18} className="text-brand-green" />
            Avisar cliente
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-400">
            Para: {row.customerName || "cliente"} · {formatPhone(row.phone)}
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40"
          />
          {result && (
            <div
              className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${
                result.ok
                  ? "bg-brand-green/10 border-brand-green/30 text-brand-green"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}
            >
              {result.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {result.text}
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
          >
            Fechar
          </button>
          <button
            onClick={send}
            disabled={sending || !message.trim() || result?.ok}
            className="flex-1 py-2.5 rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:opacity-60 text-primary-dark font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
