"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ExportButton } from "@/components/reports/export-button";

interface MarginItem {
  productId: string;
  productName: string;
  costPrice: number;
  sellPrice: number;
  margin: number;
  marginPercent: number;
  quantitySold: number;
  totalRevenue: number;
  totalProfit: number;
  costMissing: boolean;
}

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  };
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MarginPage() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [data, setData] = useState<MarginItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/reports/profit-margin?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const json: MarginItem[] = await res.json();
      setData(json);
    } catch {
      setError("Erro ao carregar relatorio.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [fetchData, startDate, endDate]);

  const totalProfit = data.reduce((sum, item) => sum + item.totalProfit, 0);
  const totalRevenue = data.reduce((sum, item) => sum + item.totalRevenue, 0);

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
          <h1 className="text-2xl font-bold text-pure-white">Margem de Lucro</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Rentabilidade por produto no periodo selecionado
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
        <ExportButton reportType="margin" startDate={startDate} endDate={endDate} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} /> Carregando...
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && data.length === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">
          Nenhuma venda encontrada no periodo selecionado.
        </p>
      )}

      {!loading && data.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <p className="text-sm text-gray-400 mb-1">Faturamento Total</p>
              <p className="text-2xl font-bold text-brand-green">
                {formatBRL(totalRevenue)}
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <p className="text-sm text-gray-400 mb-1">Lucro Total</p>
              <p className={`text-2xl font-bold ${totalProfit >= 0 ? "text-brand-green" : "text-red-400"}`}>
                {formatBRL(totalProfit)}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Produto</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Custo</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Preco Venda</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Margem R$</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Margem %</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Qtd</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Lucro Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr
                      key={item.productId}
                      className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                        item.costMissing ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-pure-white font-medium">
                        <div className="flex items-center gap-2">
                          {item.productName}
                          {item.costMissing && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                              <AlertTriangle size={12} />
                              Custo nao informado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {formatBRL(item.costPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {formatBRL(item.sellPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-pure-white">
                        {formatBRL(item.margin)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={
                            item.marginPercent >= 30
                              ? "text-emerald-400"
                              : item.marginPercent >= 15
                              ? "text-amber-400"
                              : "text-red-400"
                          }
                        >
                          {item.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {item.quantitySold}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        <span
                          className={
                            item.totalProfit >= 0 ? "text-brand-green" : "text-red-400"
                          }
                        >
                          {formatBRL(item.totalProfit)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
