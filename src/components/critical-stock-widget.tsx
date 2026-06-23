"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Package, RefreshCw } from "lucide-react";

interface LowStockProduct {
  id: string;
  name: string;
  barcode: string;
  stock_quantity: number;
  min_stock: number;
  category: string;
  image_url: string | null;
}

export function CriticalStockWidget() {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLowStock = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products/low-stock");
      if (res.ok) setProducts(await res.json());
    } catch {
      // intentionally ignored — widget is non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLowStock();
  }, []);

  if (!loading && products.length === 0) return null;

  return (
    <div className="bg-slate-800 rounded-2xl border border-amber-500/30 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-500/20 rounded-lg">
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-100 text-sm">
              Estoque Crítico
            </h2>
            {!loading && (
              <p className="text-xs text-slate-500">
                {products.length} produto{products.length !== 1 ? "s" : ""} abaixo do mínimo
              </p>
            )}
          </div>
        </div>

        <button
          onClick={fetchLowStock}
          disabled={loading}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-slate-700/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-700/60">
          {products.map((p) => {
            const ratio = p.min_stock > 0 ? p.stock_quantity / p.min_stock : 0;
            const isZero = p.stock_quantity === 0;

            return (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <div className="p-1.5 bg-slate-700 rounded-lg shrink-0">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-6 h-6 object-cover rounded"
                    />
                  ) : (
                    <Package size={16} className="text-slate-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">
                    {p.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Progress bar */}
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isZero
                            ? "bg-red-500"
                            : ratio <= 0.5
                            ? "bg-amber-500"
                            : "bg-yellow-400"
                        }`}
                        style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 shrink-0">
                      {p.stock_quantity}/{p.min_stock} un.
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    isZero
                      ? "bg-red-500/20 text-red-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {isZero ? "SEM ESTOQUE" : "CRÍTICO"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
