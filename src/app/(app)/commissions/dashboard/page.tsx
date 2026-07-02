"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Target,
  ShoppingCart,
  Loader2,
  Calendar,
  CreditCard,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  today: { total: number; count: number };
  week: { total: number; count: number };
  month: { total: number; count: number };
  commission: { amount: number; percent: number; ruleType: string };
  goal: {
    id: string;
    period: string;
    target: number;
    progress: number;
  } | null;
  recentSales: {
    id: string;
    totalAmount: number;
    createdAt: string;
    paymentMethod: string;
    customerName: string | null;
  }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  CARD: "Cartao",
  PIX: "PIX",
  LOYALTY: "Pontos",
  VOUCHER: "Voucher",
};

const PERIOD_LABELS: Record<string, string> = {
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  MONTHLY: "Mensal",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function CommissionDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/commissions/dashboard");
      if (res.ok) setData(await res.json());
    } catch {
      // intentionally ignored
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 size={24} className="animate-spin mr-2" />
        Carregando dashboard...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="font-medium">Erro ao carregar dashboard</p>
      </div>
    );
  }

  const goalPercent = data.goal?.progress ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Meu Desempenho</h1>
        <p className="text-slate-400 text-sm mt-1">
          Acompanhe suas vendas e comissoes
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10">
              <ShoppingCart size={20} className="text-blue-400" />
            </div>
            <span className="text-sm text-slate-400">Vendas Hoje</span>
          </div>
          <p className="text-2xl font-bold text-slate-100">
            {formatCurrency(data.today.total)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {data.today.count} {data.today.count === 1 ? "venda" : "vendas"}
          </p>
        </div>

        {/* Month */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10">
              <Calendar size={20} className="text-purple-400" />
            </div>
            <span className="text-sm text-slate-400">Vendas Mes</span>
          </div>
          <p className="text-2xl font-bold text-slate-100">
            {formatCurrency(data.month.total)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {data.month.count} {data.month.count === 1 ? "venda" : "vendas"}
          </p>
        </div>

        {/* Commission */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-brand-green/10">
              <DollarSign size={20} className="text-brand-green" />
            </div>
            <span className="text-sm text-slate-400">Comissao Mes</span>
          </div>
          <p className="text-2xl font-bold text-brand-green">
            {formatCurrency(data.commission.amount)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {data.commission.percent}% efetiva
          </p>
        </div>

        {/* Goal */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10">
              <Target size={20} className="text-amber-400" />
            </div>
            <span className="text-sm text-slate-400">Meta</span>
          </div>
          {data.goal ? (
            <>
              <p className="text-2xl font-bold text-slate-100">
                {Math.round(goalPercent)}%
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {PERIOD_LABELS[data.goal.period] ?? data.goal.period} &middot;{" "}
                {formatCurrency(data.goal.target)}
              </p>
              {/* Progress bar */}
              <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${goalPercent}%`,
                    backgroundColor:
                      goalPercent >= 100
                        ? "#22c55e"
                        : goalPercent >= 70
                        ? "#eab308"
                        : "#ef4444",
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Sem meta ativa</p>
          )}
        </div>
      </div>

      {/* Daily sales bar chart (simple div-based) */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <TrendingUp size={20} className="text-brand-green" />
          Resumo Semanal
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-sm text-slate-400 mb-2">Hoje</div>
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-lg font-bold text-slate-100">
                {formatCurrency(data.today.total)}
              </p>
              <p className="text-xs text-slate-500">{data.today.count} vendas</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-400 mb-2">Semana</div>
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-lg font-bold text-slate-100">
                {formatCurrency(data.week.total)}
              </p>
              <p className="text-xs text-slate-500">{data.week.count} vendas</p>
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-slate-400 mb-2">Mes</div>
            <div className="bg-slate-700/50 rounded-xl p-4">
              <p className="text-lg font-bold text-slate-100">
                {formatCurrency(data.month.total)}
              </p>
              <p className="text-xs text-slate-500">{data.month.count} vendas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <ShoppingCart size={20} className="text-brand-green" />
          Vendas Recentes
        </h2>
        {data.recentSales.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">
            Nenhuma venda registrada
          </p>
        ) : (
          <div className="space-y-2">
            {data.recentSales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-700">
                    <CreditCard size={16} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-200">
                      {sale.customerName ?? "Cliente avulso"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(sale.createdAt)} &middot;{" "}
                      {PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-brand-green">
                  {formatCurrency(sale.totalAmount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
