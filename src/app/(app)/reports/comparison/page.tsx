"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";

interface ComparisonItem {
  metric: string;
  period1Value: number;
  period2Value: number;
  delta: number;
  deltaPercent: number;
}

function getDefaultPeriods() {
  const now = new Date();
  // Period 2: current month
  const p2Start = new Date(now.getFullYear(), now.getMonth(), 1);
  // Period 1: previous month
  const p1Start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const p1End = new Date(now.getFullYear(), now.getMonth(), 0);

  return {
    period1Start: p1Start.toISOString().split("T")[0],
    period1End: p1End.toISOString().split("T")[0],
    period2Start: p2Start.toISOString().split("T")[0],
    period2End: now.toISOString().split("T")[0],
  };
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatValue(metric: string, value: number): string {
  if (metric.includes("Faturamento") || metric.includes("Ticket")) {
    return formatBRL(value);
  }
  return value.toLocaleString("pt-BR");
}

export default function ComparisonPage() {
  const defaults = getDefaultPeriods();
  const [period1Start, setPeriod1Start] = useState(defaults.period1Start);
  const [period1End, setPeriod1End] = useState(defaults.period1End);
  const [period2Start, setPeriod2Start] = useState(defaults.period2Start);
  const [period2End, setPeriod2End] = useState(defaults.period2End);
  const [data, setData] = useState<ComparisonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        period1Start,
        period1End,
        period2Start,
        period2End,
      });
      const res = await fetch(`/api/reports/period-comparison?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const json: ComparisonItem[] = await res.json();
      setData(json);
    } catch {
      setError("Erro ao carregar relatorio.");
    } finally {
      setLoading(false);
    }
  }, [period1Start, period1End, period2Start, period2End]);

  useEffect(() => {
    if (period1Start && period1End && period2Start && period2End) {
      fetchData();
    }
  }, [fetchData, period1Start, period1End, period2Start, period2End]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/reports"
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} className="text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-pure-white">
            Comparativo de Periodos
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Compare metricas entre dois periodos diferentes
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Period 1 */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Periodo 1</h3>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-400">Inicio</label>
              <input
                type="date"
                value={period1Start}
                onChange={(e) => setPeriod1Start(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-400">Fim</label>
              <input
                type="date"
                value={period1End}
                onChange={(e) => setPeriod1End(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
              />
            </div>
          </div>
        </div>

        {/* Period 2 */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Periodo 2</h3>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-400">Inicio</label>
              <input
                type="date"
                value={period2Start}
                onChange={(e) => setPeriod2Start(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-gray-400">Fim</label>
              <input
                type="date"
                value={period2End}
                onChange={(e) => setPeriod2End(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
              />
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} /> Carregando...
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((item) => {
            const isPositive = item.delta >= 0;

            return (
              <div
                key={item.metric}
                className="bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <p className="text-sm text-gray-400 mb-4 font-medium">
                  {item.metric}
                </p>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Periodo 1</p>
                    <p className="text-xl font-bold text-gray-300">
                      {formatValue(item.metric, item.period1Value)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Periodo 2</p>
                    <p className="text-xl font-bold text-pure-white">
                      {formatValue(item.metric, item.period2Value)}
                    </p>
                  </div>
                </div>
                <div
                  className={`flex items-center gap-2 pt-3 border-t border-white/10 ${
                    isPositive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp size={18} />
                  ) : (
                    <TrendingDown size={18} />
                  )}
                  <span className="font-semibold">
                    {isPositive ? "+" : ""}
                    {formatValue(item.metric, item.delta)}
                  </span>
                  <span className="text-sm opacity-75">
                    ({isPositive ? "+" : ""}
                    {item.deltaPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
