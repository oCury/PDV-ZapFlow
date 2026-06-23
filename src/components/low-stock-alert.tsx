"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  X,
  ShoppingCart,
  Package,
  Bell,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PurchaseOrderModal } from "./purchase-order-modal";

interface LowStockProduct {
  id: string;
  name: string;
  stock_quantity: number;
  category: string;
  barcode?: string;
}

const LOW_STOCK_THRESHOLD = 10;
const CHECK_INTERVAL_MS = 60_000; // Check every minute
const DISMISSED_KEY = "lowStockDismissed";

export function LowStockAlert() {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [allProducts, setAllProducts] = useState<LowStockProduct[]>([]);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showOrderModal, setShowOrderModal] = useState(false);

  const fetchLowStock = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/low-stock?threshold=${LOW_STOCK_THRESHOLD}`);
      if (!res.ok) return;
      
      const data: LowStockProduct[] = await res.json();
      
      // Store all products for the order modal
      setAllProducts(data.filter((p) => p.stock_quantity <= LOW_STOCK_THRESHOLD));
      
      // Filter out dismissed products (for this session)
      const storedDismissed = sessionStorage.getItem(DISMISSED_KEY);
      const dismissedIds = storedDismissed ? JSON.parse(storedDismissed) : [];
      setDismissed(dismissedIds);
      
      const filtered = data.filter(
        (p) => p.stock_quantity <= LOW_STOCK_THRESHOLD && !dismissedIds.includes(p.id)
      );
      
      setProducts(filtered);
      
      if (filtered.length > 0) {
        setVisible(true);
      }
    } catch {
      // intentionally ignored — widget is non-critical
    }
  }, []);

  useEffect(() => {
    fetchLowStock();
    const interval = setInterval(fetchLowStock, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLowStock]);

  const dismissProduct = (productId: string) => {
    const newDismissed = [...dismissed, productId];
    setDismissed(newDismissed);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(newDismissed));
    
    const remaining = products.filter((p) => p.id !== productId);
    setProducts(remaining);
    
    if (remaining.length === 0) {
      setVisible(false);
    }
  };

  const dismissAll = () => {
    const allIds = products.map((p) => p.id);
    const newDismissed = [...dismissed, ...allIds];
    setDismissed(newDismissed);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(newDismissed));
    setProducts([]);
    setVisible(false);
  };

  if (!visible || products.length === 0) return null;

  const urgentProducts = products.filter((p) => p.stock_quantity <= 5);
  const warningProducts = products.filter((p) => p.stock_quantity > 5 && p.stock_quantity <= 10);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md w-full animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-slate-800 border-2 border-amber-500/50 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border-b border-amber-500/30">
          <div className="p-2 bg-amber-500/20 rounded-xl animate-pulse">
            <Bell size={20} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-amber-400 text-sm flex items-center gap-2">
              <AlertTriangle size={14} />
              ALERTA DE ESTOQUE BAIXO
            </h3>
            <p className="text-xs text-slate-400">
              {products.length} produto{products.length !== 1 ? "s" : ""} precisam de reposição
            </p>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Urgent Warning */}
        {urgentProducts.length > 0 && (
          <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/30">
            <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-2">
              ⚠️ URGENTE - Comprar imediatamente!
            </p>
            <div className="space-y-2">
              {urgentProducts.slice(0, expanded ? undefined : 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 bg-red-500/10 rounded-lg"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Package size={14} className="text-red-400 shrink-0" />
                    <span className="text-sm text-slate-200 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                      {p.stock_quantity} un.
                    </span>
                    <button
                      onClick={() => dismissProduct(p.id)}
                      className="p-1 text-slate-500 hover:text-slate-300 rounded"
                      title="Dispensar"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning Products */}
        {warningProducts.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-xs font-medium text-amber-400 uppercase tracking-wide mb-2">
              Atenção - Estoque baixo
            </p>
            <div className="space-y-2">
              {warningProducts.slice(0, expanded ? undefined : 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 bg-slate-700/50 rounded-lg"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Package size={14} className="text-amber-400 shrink-0" />
                    <span className="text-sm text-slate-200 truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                      {p.stock_quantity} un.
                    </span>
                    <button
                      onClick={() => dismissProduct(p.id)}
                      className="p-1 text-slate-500 hover:text-slate-300 rounded"
                      title="Dispensar"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expand/Collapse */}
        {products.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors border-t border-slate-700"
          >
            {expanded ? (
              <>
                <ChevronUp size={14} />
                Ver menos
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Ver todos ({products.length})
              </>
            )}
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2 p-3 bg-slate-900/50 border-t border-slate-700">
          <button
            onClick={dismissAll}
            className="flex-1 px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Dispensar Tudo
          </button>
          <button
            onClick={() => setShowOrderModal(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-bold rounded-xl transition-colors"
          >
            <ShoppingCart size={16} />
            Pedido de Compra
          </button>
        </div>
      </div>

      {/* Purchase Order Modal */}
      <PurchaseOrderModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        products={allProducts}
      />
    </div>
  );
}
