"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { ExportButton } from "@/components/reports/export-button";

interface StaleItem {
  productId: string;
  productName: string;
  variantId: string | null;
  size: string | null;
  color: string | null;
  stock: number;
  lastSaleDate: string | null;
  daysSinceLastSale: number;
}

function getDaysColor(days: number): string {
  if (days === -1) return "text-red-400";
  if (days >= 60) return "text-red-400";
  if (days >= 30) return "text-amber-400";
  return "text-gray-300";
}

function getDaysRowBg(days: number): string {
  if (days === -1) return "bg-red-500/5";
  if (days >= 60) return "bg-red-500/5";
  if (days >= 30) return "bg-amber-500/5";
  return "";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function StalePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<StaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/stale-products?days=${days}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const json: StaleItem[] = await res.json();
      setData(json);
    } catch {
      setError("Erro ao carregar relatorio.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Use today as both dates for export (stale doesn't use date range but export API requires it)
  const today = new Date().toISOString().split("T")[0];

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
          <h1 className="text-2xl font-bold text-pure-white">Produtos Parados</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Produtos com estoque que nao vendem ha tempo
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium">
            Dias sem venda
          </label>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Math.max(1, parseInt(e.target.value) || 30))}
            className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
          />
        </div>
        <div className="flex gap-2">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                days === d
                  ? "bg-brand-green/20 border-brand-green/30 text-brand-green"
                  : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
        <ExportButton reportType="stale" startDate={today} endDate={today} />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={20} /> Carregando...
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && data.length === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">
          Nenhum produto parado encontrado. Todos os itens com estoque tiveram vendas recentes.
        </p>
      )}

      {!loading && data.length > 0 && (
        <>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-sm text-gray-400">
              <span className="text-2xl font-bold text-red-400 mr-2">
                {data.length}
              </span>
              produto{data.length !== 1 ? "s" : ""} parado{data.length !== 1 ? "s" : ""} ha mais de{" "}
              {days} dia{days !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Produto</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Tamanho</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Cor</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Estoque</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Ultima Venda</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Dias Parado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, idx) => (
                    <tr
                      key={`${item.productId}-${item.variantId ?? idx}`}
                      className={`border-b border-white/5 hover:bg-white/5 transition-colors ${getDaysRowBg(item.daysSinceLastSale)}`}
                    >
                      <td className="px-4 py-3 text-pure-white font-medium">
                        {item.productName}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{item.size ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-300">{item.color ?? "-"}</td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {item.stock}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {item.lastSaleDate ? formatDate(item.lastSaleDate) : "Nunca vendido"}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${getDaysColor(item.daysSinceLastSale)}`}>
                        {item.daysSinceLastSale === -1 ? "Nunca" : `${item.daysSinceLastSale}d`}
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
