"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Users,
  Gift,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  Calendar,
  DollarSign,
  TrendingUp,
  Send,
  AlertCircle,
} from "lucide-react";

interface FollowupStats {
  totalSent: number;
  sentToday: number;
  totalCashbackGiven: number;
  pendingToday: number;
  configuredDays: number;
}

interface Followup {
  id: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  saleId: string;
  saleAmount: number;
  saleDate: string;
  cashbackAmount: number;
  pointsAdded: number;
  status: string;
  sentAt: string;
  type: string;
}

interface ProcessResult {
  success: boolean;
  summary?: {
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    totalCashbackGiven: number;
  };
  error?: string;
}

export default function FollowupsPage() {
  const [stats, setStats] = useState<FollowupStats | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/followups");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setFollowups(data.recent);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runManualFollowup = async (dryRun: boolean = false) => {
    setProcessing(true);
    setProcessResult(null);

    try {
      const res = await fetch("/api/cron/customer-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });

      const data = await res.json();
      setProcessResult(data);

      if (data.success && !dryRun) {
        fetchData();
      }
    } catch {
      setProcessResult({ success: false, error: "Erro de conexão" });
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPhone = (phone: string) => {
    const d = phone.replace(/\D/g, "");
    if (d.length >= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length >= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return phone;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Follow-up de Clientes</h1>
          <p className="text-slate-400 text-sm mt-1">
            Acompanhe o envio automático de cashback para clientes
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-400 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          <AlertCircle size={18} className="shrink-0" />
          <span>
            Não foi possível carregar os dados de follow-up. Verifique sua
            conexão e tente novamente.
          </span>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400 font-medium">Total Enviados</p>
              <div className="bg-green-500/10 p-2 rounded-xl">
                <MessageCircle size={20} className="text-green-500" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-slate-100">{stats.totalSent}</p>
            <p className="text-xs text-slate-500 mt-1">mensagens de follow-up</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400 font-medium">Enviados Hoje</p>
              <div className="bg-blue-500/10 p-2 rounded-xl">
                <Send size={20} className="text-blue-500" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-slate-100">{stats.sentToday}</p>
            <p className="text-xs text-slate-500 mt-1">hoje às 8h</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400 font-medium">Cashback Dado</p>
              <div className="bg-brand-green/10 p-2 rounded-xl">
                <Gift size={20} className="text-brand-green" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-brand-green">
              R$ {stats.totalCashbackGiven.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">em pontos de fidelidade</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400 font-medium">Pendentes Hoje</p>
              <div className="bg-amber-500/10 p-2 rounded-xl">
                <Clock size={20} className="text-amber-500" />
              </div>
            </div>
            <p className="text-2xl font-bold mt-2 text-slate-100">{stats.pendingToday}</p>
            <p className="text-xs text-slate-500 mt-1">aguardando envio</p>
          </div>
        </div>
      )}

      {/* Manual Processing */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-100">Processamento Manual</h2>
            <p className="text-xs text-slate-500 mt-1">
              O sistema roda automaticamente às 8h. Use isso para testes ou reprocessamento.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => runManualFollowup(true)}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <AlertCircle size={16} />}
            Simular (Dry Run)
          </button>
          <button
            onClick={() => runManualFollowup(false)}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Processar Agora
          </button>
        </div>

        {processResult && (
          <div
            className={`mt-4 p-4 rounded-xl ${
              processResult.success
                ? "bg-green-500/10 border border-green-500/30"
                : "bg-red-500/10 border border-red-500/30"
            }`}
          >
            {processResult.success && processResult.summary ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-green-400 flex items-center gap-2">
                  <CheckCircle size={16} />
                  Processamento concluído!
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                  <div>
                    <p className="text-xs text-slate-500">Processados</p>
                    <p className="text-lg font-bold text-slate-200">{processResult.summary.processed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Enviados</p>
                    <p className="text-lg font-bold text-green-400">{processResult.summary.sent}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Falhas</p>
                    <p className="text-lg font-bold text-red-400">{processResult.summary.failed}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Cashback</p>
                    <p className="text-lg font-bold text-brand-green">
                      R$ {processResult.summary.totalCashbackGiven.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-400 flex items-center gap-2">
                <XCircle size={16} />
                {processResult.error || "Erro ao processar"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Recent Followups */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-100">Histórico de Follow-ups</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 size={24} className="animate-spin mr-2" />
            Carregando...
          </div>
        ) : followups.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Users size={48} className="mx-auto mb-3 text-slate-600" />
            <p className="font-medium">Nenhum follow-up enviado ainda</p>
            <p className="text-sm mt-1">
              Os follow-ups serão enviados automaticamente {stats?.configuredDays || 15} dias após cada compra
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-700/50 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Cliente</th>
                  <th className="px-6 py-3">Venda</th>
                  <th className="px-6 py-3">Cashback</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Enviado em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {followups.map((followup) => (
                  <tr key={followup.id} className="hover:bg-slate-700/30">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {followup.customerName || "Cliente"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatPhone(followup.customerPhone)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          R$ {followup.saleAmount.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(followup.saleDate)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <Gift size={14} className="text-brand-green" />
                        <span className="text-sm font-medium text-brand-green">
                          R$ {followup.cashbackAmount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        +{followup.pointsAdded} pts
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      {followup.status === "SENT" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                          <CheckCircle size={12} />
                          Enviado
                        </span>
                      ) : followup.status === "FAILED" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                          <XCircle size={12} />
                          Falhou
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">
                          <Clock size={12} />
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {formatDate(followup.sentAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-200 mb-3 flex items-center gap-2">
          <TrendingUp size={18} className="text-brand-green" />
          Como funciona o Follow-up Automático
        </h3>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-brand-green">•</span>
            <span>
              <strong className="text-slate-300">Diariamente às 8h</strong>, o sistema verifica
              clientes que compraram há exatamente {stats?.configuredDays || 15} dias
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-green">•</span>
            <span>
              Cada cliente elegível recebe uma mensagem no WhatsApp agradecendo a visita
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-green">•</span>
            <span>
              <strong className="text-slate-300">10% de cashback</strong> é adicionado
              automaticamente como pontos de fidelidade
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-green">•</span>
            <span>
              Os pontos podem ser usados como desconto em compras futuras
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
