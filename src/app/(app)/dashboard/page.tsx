"use client";

import { useState, useEffect, useCallback } from "react";
import { CriticalStockWidget } from "@/components/critical-stock-widget";
import {
  ShoppingCart,
  Package,
  DollarSign,
  TrendingUp,
  Banknote,
  CreditCard,
  QrCode,
  Clock,
} from "lucide-react";

interface DashboardData {
  todayRevenue: number;
  productsSold: number;
  transactionCount: number;
  averageTicket: number;
  revenueChange: number;
  latestSales: LatestSale[];
}

interface LatestSale {
  id: string;
  totalAmount: number;
  paymentMethod: "CASH" | "CARD" | "PIX";
  createdAt: string;
  itemCount: number;
}

const REFRESH_INTERVAL_MS = 30_000;

  const paymentMethodConfig = {
  CASH: { label: "Dinheiro", icon: Banknote, color: "text-green-400 bg-green-500/20" },
  CARD: { label: "Cartão", icon: CreditCard, color: "text-blue-400 bg-blue-500/20" },
  PIX: { label: "PIX", icon: QrCode, color: "text-purple-400 bg-purple-500/20" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/dashboard");
      if (!res.ok) throw new Error("Falha ao carregar dados");
      const json: DashboardData = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Erro ao carregar dados do dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-36 bg-slate-700 rounded-lg animate-pulse" />
          <div className="h-4 w-56 bg-slate-700/60 rounded mt-2 animate-pulse" />
        </div>

        {/* KPI cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-slate-800 rounded-2xl p-5 border border-slate-700 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 bg-slate-700 rounded" />
                <div className="w-9 h-9 bg-slate-700 rounded-xl" />
              </div>
              <div className="h-8 w-28 bg-slate-700 rounded mt-3" />
              <div className="h-3 w-20 bg-slate-700/60 rounded mt-2" />
            </div>
          ))}
        </div>

        {/* Latest sales table skeleton */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 animate-pulse">
          <div className="h-5 w-32 bg-slate-700 rounded mb-4" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-3 rounded-xl bg-slate-700/50"
              >
                <div className="w-10 h-10 bg-slate-600 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-20 bg-slate-600 rounded" />
                  <div className="h-3 w-12 bg-slate-600/60 rounded" />
                </div>
                <div className="text-right space-y-1.5 shrink-0">
                  <div className="h-3.5 w-20 bg-slate-600 rounded ml-auto" />
                  <div className="h-3 w-16 bg-slate-600/60 rounded ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <div className="text-red-400 p-4">{error}</div>;
  }

  const stats = [
    {
      label: "Vendas Hoje",
      value: `R$ ${data.todayRevenue.toFixed(2)}`,
      icon: DollarSign,
      change: `${data.revenueChange >= 0 ? "+" : ""}${data.revenueChange}%`,
      highlight: true,
    },
    {
      label: "Produtos Vendidos",
      value: data.productsSold.toString(),
      icon: Package,
      change: "hoje",
      highlight: false,
    },
    {
      label: "Transações",
      value: data.transactionCount.toString(),
      icon: ShoppingCart,
      change: "hoje",
      highlight: false,
    },
    {
      label: "Ticket Médio",
      value: `R$ ${data.averageTicket.toFixed(2)}`,
      icon: TrendingUp,
      change: "hoje",
      highlight: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">
          Visão geral do seu ponto de venda
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-800 rounded-2xl p-5 border border-slate-700"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400 font-medium">{stat.label}</p>
              <div className="bg-brand-green/10 p-2 rounded-xl">
                <stat.icon size={20} className="text-brand-green" />
              </div>
            </div>
            <p
              className={`text-2xl font-bold mt-2 ${
                stat.highlight ? "text-brand-green" : "text-slate-100"
              }`}
            >
              {stat.value}
            </p>
            <p className="text-xs text-slate-500 mt-1">{stat.change} vs. ontem</p>
          </div>
        ))}
      </div>

      {/* M2 — Critical Stock Alerts */}
      <CriticalStockWidget />

      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="font-semibold text-slate-100 mb-4">Últimas Vendas</h2>

        {data.latestSales.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <ShoppingCart size={48} className="mx-auto mb-3 text-slate-600" />
            <p className="font-medium">Nenhuma venda registrada</p>
            <p className="text-sm mt-1">
              As vendas aparecerão aqui quando forem realizadas
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.latestSales.map((sale) => {
              const method = paymentMethodConfig[sale.paymentMethod];
              const MethodIcon = method.icon;
              const date = new Date(sale.createdAt);
              const timeStr = date.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const dateStr = date.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
              });

              return (
                <div
                  key={sale.id}
                  className="flex items-center gap-4 p-3 rounded-xl bg-slate-700/50 hover:bg-slate-700 transition-colors"
                >
                  <div className={`p-2 rounded-xl ${method.color}`}>
                    <MethodIcon size={18} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">
                      {method.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {sale.itemCount} {sale.itemCount === 1 ? "item" : "itens"}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-brand-green">
                      R$ {sale.totalAmount.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center justify-end gap-1">
                      <Clock size={10} />
                      {dateStr} {timeStr}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
