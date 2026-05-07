"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
} from "lucide-react";
import { NfceStatusBadge } from "@/components/fiscal/nfce-status-badge";
import { NfceDetailsModal } from "@/components/fiscal/nfce-details-modal";

interface SaleWithNfce {
  id: string;
  nfce_status: string | null;
  nfce_number: number | null;
  nfce_series: number | null;
  nfce_access_key: string | null;
  nfce_qr_url: string | null;
  nfce_danfe_url: string | null;
  nfce_protocol: string | null;
  nfce_errors: string | null;
  total_amount: number;
  created_at: string;
}

interface QueueItem {
  id: string;
  sale_id: string;
  attempts: number;
  last_error: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  sale: {
    id: string;
    total_amount: number;
    created_at: string;
  };
}

type TabKey = "notas" | "fila";

export default function FiscalPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("notas");
  const [sales, setSales] = useState<SaleWithNfce[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [selectedSale, setSelectedSale] = useState<SaleWithNfce | null>(null);
  const [cancelSaleId, setCancelSaleId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const fetchSales = useCallback(async () => {
    try {
      const res = await fetch("/api/sales?has_nfce=true&limit=50");
      if (res.ok) {
        const data = await res.json();
        const salesData = Array.isArray(data) ? data : data.sales ?? [];
        setSales(salesData);
      }
    } catch {
      // Best-effort
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/fiscal/queue");
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch {
      // Best-effort
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchSales(), fetchQueue()]);
    setLoading(false);
  }, [fetchSales, fetchQueue]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRetryQueue = async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/fiscal/retry", { method: "POST" });
      if (res.ok) {
        await loadData();
      }
    } catch {
      // Best-effort
    } finally {
      setRetrying(false);
    }
  };

  const handleCancelNfce = async () => {
    if (!cancelSaleId || cancelReason.length < 15) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/fiscal/cancel/${cancelSaleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (res.ok) {
        setCancelSaleId(null);
        setCancelReason("");
        await loadData();
      }
    } catch {
      // Best-effort
    } finally {
      setCancelling(false);
    }
  };

  // Summary counts
  const todaySales = sales.filter((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      s.nfce_status === "authorized" &&
      s.created_at.slice(0, 10) === today
    );
  });

  const pendingCount = queue.filter(
    (q) => q.status === "PENDING"
  ).length;
  const errorCount = sales.filter(
    (s) => s.nfce_status === "error"
  ).length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText size={28} className="text-brand-green" />
          <h1 className="text-2xl font-bold text-pure-white">
            NFC-e / Fiscal
          </h1>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-pure-white border border-white/10 transition-colors text-sm"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 size={20} className="text-green-400" />
            <span className="text-gray-400 text-sm">Emitidas Hoje</span>
          </div>
          <p className="text-3xl font-bold text-pure-white">
            {todaySales.length}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock size={20} className="text-yellow-400" />
            <span className="text-gray-400 text-sm">Pendentes na Fila</span>
          </div>
          <p className="text-3xl font-bold text-pure-white">
            {pendingCount}
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle size={20} className="text-red-400" />
            <span className="text-gray-400 text-sm">Com Erro</span>
          </div>
          <p className="text-3xl font-bold text-pure-white">{errorCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("notas")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "notas"
              ? "bg-brand-green text-primary-dark"
              : "text-gray-400 hover:text-pure-white"
          }`}
        >
          Notas Emitidas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("fila")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "fila"
              ? "bg-brand-green text-primary-dark"
              : "text-gray-400 hover:text-pure-white"
          }`}
        >
          Fila de Contingencia
          {pendingCount > 0 && (
            <span className="ml-2 bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full text-xs">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-brand-green" />
        </div>
      ) : activeTab === "notas" ? (
        <NotasTable
          sales={sales}
          onViewDetails={setSelectedSale}
          onCancel={setCancelSaleId}
        />
      ) : (
        <FilaTable
          queue={queue}
          retrying={retrying}
          onRetry={handleRetryQueue}
        />
      )}

      {/* Details Modal */}
      {selectedSale && (
        <NfceDetailsModal
          isOpen={true}
          onClose={() => setSelectedSale(null)}
          sale={selectedSale}
        />
      )}

      {/* Cancel Modal */}
      {cancelSaleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setCancelSaleId(null);
              setCancelReason("");
            }}
          />
          <div className="relative bg-primary-dark border border-white/10 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-lg font-bold text-pure-white">
              Cancelar NFC-e
            </h3>
            <p className="text-gray-400 text-sm">
              Informe o motivo do cancelamento (minimo 15 caracteres, exigencia
              SEFAZ).
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Motivo do cancelamento..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-pure-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green resize-none"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCancelSaleId(null);
                  setCancelReason("");
                }}
                className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-pure-white hover:bg-white/5 text-sm font-semibold transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCancelNfce}
                disabled={cancelReason.length < 15 || cancelling}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {cancelling && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                Cancelar NFC-e
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function NotasTable({
  sales,
  onViewDetails,
  onCancel,
}: {
  sales: SaleWithNfce[];
  onViewDetails: (sale: SaleWithNfce) => void;
  onCancel: (saleId: string) => void;
}) {
  const filteredSales = sales.filter((s) => s.nfce_status);

  if (filteredSales.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <FileText size={48} className="mx-auto mb-3 opacity-30" />
        <p>Nenhuma nota fiscal emitida ainda.</p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-gray-400 font-medium px-4 py-3">
                Venda
              </th>
              <th className="text-left text-gray-400 font-medium px-4 py-3">
                Status
              </th>
              <th className="text-left text-gray-400 font-medium px-4 py-3">
                Numero
              </th>
              <th className="text-left text-gray-400 font-medium px-4 py-3">
                Data
              </th>
              <th className="text-right text-gray-400 font-medium px-4 py-3">
                Valor
              </th>
              <th className="text-right text-gray-400 font-medium px-4 py-3">
                Acoes
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((sale) => (
              <tr
                key={sale.id}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="px-4 py-3 text-pure-white font-mono text-xs">
                  {sale.id.slice(0, 8)}...
                </td>
                <td className="px-4 py-3">
                  <NfceStatusBadge status={sale.nfce_status} />
                </td>
                <td className="px-4 py-3 text-pure-white font-mono">
                  {sale.nfce_number ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(sale.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right text-pure-white font-semibold">
                  R$ {Number(sale.total_amount).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onViewDetails(sale)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-pure-white transition-colors"
                      title="Ver detalhes"
                    >
                      <Eye size={14} />
                    </button>
                    {sale.nfce_status === "authorized" && (
                      <button
                        type="button"
                        onClick={() => onCancel(sale.id)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                        title="Cancelar NFC-e"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaTable({
  queue,
  retrying,
  onRetry,
}: {
  queue: QueueItem[];
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying || queue.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:opacity-50 disabled:cursor-not-allowed text-primary-dark font-bold text-sm transition-colors"
        >
          {retrying ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Reprocessar Fila
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 size={48} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum item na fila de contingencia.</p>
        </div>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Venda
                  </th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Status
                  </th>
                  <th className="text-center text-gray-400 font-medium px-4 py-3">
                    Tentativas
                  </th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">
                    Ultimo Erro
                  </th>
                  <th className="text-right text-gray-400 font-medium px-4 py-3">
                    Valor
                  </th>
                  <th className="text-right text-gray-400 font-medium px-4 py-3">
                    Criado em
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-pure-white font-mono text-xs">
                      {item.sale_id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          item.status === "PENDING"
                            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                            : item.status === "PROCESSING"
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            : item.status === "SENT"
                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                            : "bg-red-500/20 text-red-400 border-red-500/30"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-pure-white font-mono">
                      {item.attempts}
                    </td>
                    <td className="px-4 py-3 text-red-400 text-xs max-w-xs truncate">
                      {item.last_error ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-pure-white font-semibold">
                      R$ {Number(item.sale.total_amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {new Date(item.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
