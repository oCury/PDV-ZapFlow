"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ExportButton } from "@/components/reports/export-button";

interface TurnoverItem {
  productId: string;
  productName: string;
  variantId: string | null;
  size: string | null;
  color: string | null;
  quantitySold: number;
  currentStock: number;
  turnoverRate: number;
}

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  };
}

function getTurnoverColor(rate: number): string {
  if (rate >= 3) return "text-emerald-400";
  if (rate >= 1) return "text-amber-400";
  return "text-red-400";
}

function getTurnoverLabel(rate: number): string {
  if (rate >= 3) return "Alto";
  if (rate >= 1) return "Medio";
  return "Baixo";
}

export default function TurnoverPage() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [data, setData] = useState<TurnoverItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/reports/stock-turnover?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const json: TurnoverItem[] = await res.json();
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
          <h1 className="text-2xl font-bold text-pure-white">Giro de Estoque</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Rotatividade dos produtos: vendas vs estoque atual
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
        <ExportButton reportType="turnover" startDate={startDate} endDate={endDate} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} /> Carregando...
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && data.length === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">
          Nenhum dado de estoque encontrado.
        </p>
      )}

      {!loading && data.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Produto</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Tamanho</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Cor</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Qtd Vendida</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Estoque Atual</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Giro</th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, idx) => (
                  <tr
                    key={`${item.productId}-${item.variantId ?? idx}`}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-pure-white font-medium">
                      {item.productName}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{item.size ?? "-"}</td>
                    <td className="px-4 py-3 text-gray-300">{item.color ?? "-"}</td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {item.quantitySold}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {item.currentStock}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${getTurnoverColor(item.turnoverRate)}`}>
                      {item.turnoverRate.toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getTurnoverColor(item.turnoverRate)}`}
                      >
                        {getTurnoverLabel(item.turnoverRate)}
                      </span>
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
