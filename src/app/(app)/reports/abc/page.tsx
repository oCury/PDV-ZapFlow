"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ExportButton } from "@/components/reports/export-button";

interface AbcItem {
  productId: string;
  productName: string;
  category: string;
  revenue: number;
  percentage: number;
  cumulativePercentage: number;
  classification: "A" | "B" | "C";
  quantitySold: number;
}

interface CategoryOption {
  id: string;
  name: string;
}

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  };
}

const classificationColors: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  B: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  C: "bg-red-500/20 text-red-400 border-red-500/30",
};

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AbcCurvePage() {
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [data, setData] = useState<AbcItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((cats: CategoryOption[]) => setCategories(cats))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (categoryId) params.set("categoryId", categoryId);
      const res = await fetch(`/api/reports/abc-curve?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const json: AbcItem[] = await res.json();
      setData(json);
    } catch {
      setError("Erro ao carregar relatorio.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, categoryId]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchData();
    }
  }, [fetchData, startDate, endDate]);

  const chartData = data.slice(0, 20).map((item) => ({
    name: item.productName.length > 20
      ? item.productName.substring(0, 20) + "..."
      : item.productName,
    faturamento: item.revenue,
  }));

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
          <h1 className="text-2xl font-bold text-pure-white">Curva ABC</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Classificacao de produtos por contribuicao no faturamento
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">Categoria</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <ExportButton reportType="abc" startDate={startDate} endDate={endDate} />
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
          {/* Chart */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-pure-white mb-4">
              Top 20 Produtos por Faturamento
            </h2>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
                <XAxis
                  type="number"
                  stroke="#6b7280"
                  tickFormatter={(v) => formatBRL(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="#6b7280"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                  formatter={(value) => [formatBRL(Number(value)), "Faturamento"]}
                />
                <Bar dataKey="faturamento" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Produto
                    </th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">
                      Categoria
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Faturamento
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      %
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      % Acum.
                    </th>
                    <th className="text-center px-4 py-3 text-gray-400 font-medium">
                      Class.
                    </th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">
                      Qtd
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr
                      key={item.productId}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 text-pure-white font-medium">
                        {item.productName}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{item.category}</td>
                      <td className="px-4 py-3 text-right text-pure-white">
                        {formatBRL(item.revenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {item.percentage.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {item.cumulativePercentage.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            classificationColors[item.classification]
                          }`}
                        >
                          {item.classification}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {item.quantitySold}
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
