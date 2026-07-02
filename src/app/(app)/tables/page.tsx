"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  UtensilsCrossed,
  Plus,
  Clock,
  ShoppingCart,
  Check,
  X,
  Loader2,
  RefreshCw,
  Phone,
  Search,
  MessageCircle,
  Send,
} from "lucide-react";

interface OpenOrder {
  id: string;
  total_amount: number;
  created_at: string;
  _count: { items: number };
}

interface TableRow {
  id: string;
  number: number;
  name: string | null;
  capacity: number;
  whatsapp: string | null;
  status: string;
  openOrder: OpenOrder | null;
}

function elapsedTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export default function TablesPage() {
  const router = useRouter();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [openOrderModal, setOpenOrderModal] = useState<TableRow | null>(null);
  const [orderPhone, setOrderPhone] = useState("");
  const [orderCustomer, setOrderCustomer] = useState<{ id: string; name?: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ number: "", name: "", capacity: "4", whatsapp: "" });
  const [whatsappModal, setWhatsappModal] = useState<TableRow | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [whatsappResult, setWhatsappResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resumeAfterInactivity = useCallback(() => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setIsPaused(false), 5_000);
  }, []);

  const handleInteractionStart = useCallback(() => {
    setIsPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
  }, []);

  const handleInteractionEnd = useCallback(() => {
    resumeAfterInactivity();
  }, [resumeAfterInactivity]);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tables");
      if (res.ok) setTables(await res.json());
    } catch { // intentionally ignored
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTables();
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, [fetchTables]);

  useEffect(() => {
    if (isPaused) return;
    // Auto-refresh every 30s so status stays up-to-date
    const interval = setInterval(fetchTables, 30_000);
    return () => clearInterval(interval);
  }, [fetchTables, isPaused]);

  const searchCustomerByPhone = async () => {
    const digits = orderPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Informe pelo menos 10 dígitos do telefone.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/search?phone=${encodeURIComponent(digits)}`);
      if (res.ok) {
        const data = await res.json();
        setOrderCustomer({ id: data.id, name: data.name ?? data.phone });
      } else {
        setOrderCustomer(null);
        if (res.status === 404) setError("Cliente não encontrado. Será cadastrado ao abrir a comanda.");
        else setError("Erro ao buscar. Verifique o telefone.");
      }
    } catch {
      setOrderCustomer(null);
      setError("Erro de conexão ao buscar cliente.");
    } finally {
      setSearching(false);
    }
  };

  const handleContinueToPdv = () => {
    const digits = orderPhone.replace(/\D/g, "");
    if (digits.length < 10 || !openOrderModal) return;
    sessionStorage.setItem(
      "tableOrder",
      JSON.stringify({
        tableId: openOrderModal.id,
        tableNumber: openOrderModal.number,
        phone: digits,
        customerId: orderCustomer?.id ?? null,
      })
    );
    setOpenOrderModal(null);
    setOrderPhone("");
    setOrderCustomer(null);
    setError(null);
    router.push(`/pdv?tableId=${openOrderModal.id}`);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: Number(form.number),
          name: form.name || undefined,
          capacity: Number(form.capacity),
          whatsapp: form.whatsapp?.replace(/\D/g, "").length >= 10 ? form.whatsapp.replace(/\D/g, "") : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setCreateOpen(false);
      setForm({ number: "", name: "", capacity: "4", whatsapp: "" });
      fetchTables();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const openWhatsappModal = (table: TableRow) => {
    setWhatsappModal(table);
    setWhatsappResult(null);
    const defaultMsg = table.openOrder
      ? `Olá! Sua comanda na Mesa ${table.number} está em R$ ${Number(table.openOrder.total_amount).toFixed(2)}. Aguardamos seu pagamento!`
      : `Olá! Sua mesa ${table.number} está disponível. Aguardamos você!`;
    setWhatsappMessage(defaultMsg);
  };

  const sendWhatsappMessage = async () => {
    if (!whatsappModal?.whatsapp || !whatsappMessage.trim()) return;
    
    setSendingWhatsapp(true);
    setWhatsappResult(null);
    
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: whatsappModal.whatsapp,
          message: whatsappMessage,
          type: "text",
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setWhatsappResult({ success: true, message: "Mensagem enviada com sucesso!" });
        setTimeout(() => {
          setWhatsappModal(null);
          setWhatsappMessage("");
          setWhatsappResult(null);
        }, 2000);
      } else {
        setWhatsappResult({ success: false, message: data.error || "Erro ao enviar mensagem" });
      }
    } catch {
      setWhatsappResult({ success: false, message: "Erro de conexão" });
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const available = tables.filter((t) => t.status === "AVAILABLE");
  const occupied = tables.filter((t) => t.status === "OCCUPIED");

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Mesas & Comandas</h1>
          <p className="text-slate-400 text-sm mt-1">
            {occupied.length} ocupada{occupied.length !== 1 ? "s" : ""} ·{" "}
            {available.length} disponíve{available.length !== 1 ? "is" : "l"}
            {isPaused && (
              <span className="ml-2 text-amber-400 text-xs font-medium">
                · atualização pausada
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTables}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-400 transition-colors"
            title="Atualizar agora"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold px-5 py-2.5 rounded-2xl transition-colors text-sm flex items-center gap-2"
          >
            <Plus size={18} />
            Nova Mesa
          </button>
        </div>
      </div>

      {loading && tables.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando mesas...
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-24 text-slate-500">
          <UtensilsCrossed size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="font-medium">Nenhuma mesa cadastrada</p>
          <p className="text-sm mt-1">Crie mesas para gerenciar comandas abertas</p>
        </div>
      ) : (
        <>
          {/* Occupied tables */}
          {occupied.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Ocupadas
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {occupied.map((t) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    onViewOrder={() => t.openOrder && router.push(`/pdv?orderId=${t.openOrder.id}`)}
                    onSendWhatsapp={t.whatsapp ? () => openWhatsappModal(t) : undefined}
                    onInteractionStart={handleInteractionStart}
                    onInteractionEnd={handleInteractionEnd}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Available tables */}
          {available.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Disponíveis
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {available.map((t) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    onOpenOrder={() => {
                      setOpenOrderModal(t);
                      setOrderPhone("");
                      setOrderCustomer(null);
                      setError(null);
                    }}
                    onSendWhatsapp={t.whatsapp ? () => openWhatsappModal(t) : undefined}
                    onInteractionStart={handleInteractionStart}
                    onInteractionEnd={handleInteractionEnd}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Open Order Modal — phone required for charging if customer leaves without paying */}
      {openOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpenOrderModal(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">
                Mesa {openOrderModal.number} — Telefone do Cliente
              </h2>
              <button onClick={() => setOpenOrderModal(null)} className="text-slate-500 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Obrigatório para cobrança em caso de saída sem pagamento.
            </p>
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="tel"
                    value={orderPhone}
                    onChange={(e) => setOrderPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className={inputCls + " pl-10"}
                  />
                </div>
                <button
                  type="button"
                  onClick={searchCustomerByPhone}
                  disabled={searching || orderPhone.replace(/\D/g, "").length < 10}
                  className="touch-target min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                  title="Buscar cliente"
                >
                  <Search size={20} className={searching ? "animate-pulse" : ""} />
                </button>
              </div>
              {orderCustomer && (
                <p className="text-sm text-brand-green flex items-center gap-2">
                  ✓ Cliente: {orderCustomer.name ?? "Cadastrado"}
                </p>
              )}
              {error && (
                <p className="text-sm text-amber-400">{error}</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setOpenOrderModal(null)}
                className="flex-1 px-4 py-3 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleContinueToPdv}
                disabled={orderPhone.replace(/\D/g, "").length < 10}
                className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-primary-dark font-bold py-3 rounded-2xl text-sm transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Table Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">Nova Mesa</h2>
              <button onClick={() => setCreateOpen(false)} className="text-slate-500 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              {error && (
                <div className="bg-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl border border-red-500/30">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Número *</label>
                <input required type="number" min="1" value={form.number} onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))} className={inputCls} placeholder="1" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nome (opcional)</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="Ex: Varanda, Mesa Reservada..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Capacidade</label>
                <input type="number" min="1" max="20" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                  <MessageCircle size={14} />
                  WhatsApp (opcional)
                </label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => setForm((p) => ({ ...p, whatsapp: e.target.value }))}
                  placeholder="(11) 99999-9999 — para avisos e cobrança"
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Envie lembretes e cobranças via WhatsApp
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 px-4 py-3 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 text-primary-dark font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Message Modal */}
      {whatsappModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setWhatsappModal(null)} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <MessageCircle size={20} className="text-green-500" />
                Enviar WhatsApp
              </h2>
              <button onClick={() => setWhatsappModal(null)} className="text-slate-500 hover:text-slate-200">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-slate-700/50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Mesa</p>
                <p className="text-sm text-slate-200 font-medium">
                  {whatsappModal.number}{whatsappModal.name ? ` - ${whatsappModal.name}` : ""}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  WhatsApp: {formatPhone(whatsappModal.whatsapp || "")}
                </p>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Mensagem</label>
                <textarea
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  rows={4}
                  className={inputCls + " resize-none"}
                  placeholder="Digite a mensagem..."
                />
              </div>

              {whatsappResult && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    whatsappResult.success
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {whatsappResult.success ? <Check size={16} /> : <X size={16} />}
                  {whatsappResult.message}
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setWhatsappModal(null)}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={sendWhatsappMessage}
                  disabled={sendingWhatsapp || !whatsappMessage.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  {sendingWhatsapp ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table Card ────────────────────────────────────────────────────────────────

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length >= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length >= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

function TableCard({
  table,
  onViewOrder,
  onOpenOrder,
  onSendWhatsapp,
  onInteractionStart,
  onInteractionEnd,
}: {
  table: TableRow;
  onViewOrder?: () => void;
  onOpenOrder?: () => void;
  onSendWhatsapp?: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}) {
  const isOccupied = table.status === "OCCUPIED";

  return (
    <div
      onMouseEnter={onInteractionStart}
      onMouseLeave={onInteractionEnd}
      onTouchStart={onInteractionStart}
      onTouchEnd={onInteractionEnd}
      className={`relative rounded-2xl border p-5 flex flex-col gap-4 transition-colors ${
        isOccupied
          ? "bg-slate-800 border-brand-green/30"
          : "bg-slate-800 border-slate-700 hover:border-slate-600"
      }`}
    >
      {/* Status indicator */}
      <div
        className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${
          isOccupied ? "bg-brand-green animate-pulse" : "bg-slate-600"
        }`}
      />

      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black text-slate-100">
            {table.number}
          </span>
          {table.name && (
            <span className="text-sm text-slate-500 truncate">{table.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-600">
          <span>Capacidade: {table.capacity} pessoas</span>
          {table.whatsapp && (
            <button
              onClick={(e) => { e.stopPropagation(); onSendWhatsapp?.(); }}
              className="flex items-center gap-1 text-green-500 hover:text-green-400 transition-colors"
              title={`Enviar WhatsApp: ${formatPhone(table.whatsapp)}`}
            >
              <MessageCircle size={12} />
              <span className="text-[10px]">Enviar</span>
            </button>
          )}
        </div>
      </div>

      {isOccupied && table.openOrder ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <ShoppingCart size={11} />
              {table.openOrder._count.items} ite{table.openOrder._count.items !== 1 ? "ns" : "m"}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {elapsedTime(table.openOrder.created_at)}
            </span>
          </div>
          <p className="text-xl font-bold text-brand-green">
            R$ {Number(table.openOrder.total_amount).toFixed(2)}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onViewOrder}
              className="flex-1 py-2.5 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Check size={14} />
              Ver Comanda
            </button>
            {onSendWhatsapp && (
              <button
                onClick={onSendWhatsapp}
                className="py-2.5 px-3 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors"
                title="Enviar mensagem WhatsApp"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onOpenOrder}
            className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Abrir Comanda
          </button>
          {onSendWhatsapp && (
            <button
              onClick={onSendWhatsapp}
              className="py-2.5 px-3 rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors"
              title="Enviar mensagem WhatsApp"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
