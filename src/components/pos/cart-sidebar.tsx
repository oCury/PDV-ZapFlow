"use client";

import { ShoppingCart, Phone, Loader2 } from "lucide-react";
import type { CartItem } from "@/lib/validations/pos";
import { CartItemCard } from "./cart-item-card";

interface CartSidebarProps {
  cart: CartItem[];
  total: number;
  onQuantityChange: (id: string, quantity: number) => void;
  onPriceOverride?: (id: string, unitPrice: number) => void;
  onRemove: (id: string) => void;
  onFinishSale: () => void;
  allowPriceOverride?: boolean;
  /** Table mode: show "Abrir Comanda" and phone info */
  tableMode?: { tableNumber: number; phone: string };
  /** When tableId in URL but no phone in session — show "Voltar às Mesas" */
  requiresTablePhone?: boolean;
  onBackToTables?: () => void;
  isOpeningOrder?: boolean;
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length >= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length >= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

export function CartSidebar({
  cart,
  total,
  onQuantityChange,
  onPriceOverride,
  onRemove,
  onFinishSale,
  allowPriceOverride = false,
  tableMode,
  requiresTablePhone = false,
  onBackToTables,
  isOpeningOrder = false,
}: CartSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-slate-800/80 rounded-2xl border border-slate-600/50 overflow-hidden">
      <div className="p-4 border-b border-slate-600/50">
        <div className="flex items-center gap-2">
          <ShoppingCart size={24} className="text-brand-green" />
          <h2 className="font-bold text-white text-lg">
            {tableMode ? `Mesa ${tableMode.tableNumber}` : "Carrinho"}
          </h2>
          <span className="ml-auto bg-brand-green/20 text-brand-green text-sm font-bold px-3 py-1 rounded-full">
            {cart.length} itens
          </span>
        </div>
        {tableMode && (
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
            <Phone size={12} />
            {formatPhone(tableMode.phone)}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cart.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ShoppingCart size={48} className="mx-auto mb-3 text-slate-500" />
            <p className="text-base">Carrinho vazio</p>
          </div>
        ) : (
          cart.map((item) => (
            <CartItemCard
              key={item.id}
              item={item}
              onQuantityChange={onQuantityChange}
              onPriceOverride={onPriceOverride}
              onRemove={onRemove}
              allowPriceOverride={allowPriceOverride}
            />
          ))
        )}
      </div>

      <div className="p-4 border-t border-slate-600/50 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 font-medium">Total</span>
          <span className="text-2xl font-bold text-white">
            R$ {total.toFixed(2)}
          </span>
        </div>

        <button
          type="button"
          disabled={
            (requiresTablePhone ? false : cart.length === 0) || isOpeningOrder
          }
          onClick={
            requiresTablePhone && onBackToTables
              ? onBackToTables
              : onFinishSale
          }
          className={`touch-target w-full min-h-[56px] rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors active:scale-[0.98] ${
            requiresTablePhone
              ? "bg-slate-600 hover:bg-slate-500 text-slate-200"
              : "bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-primary-dark"
          }`}
        >
          {isOpeningOrder ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Abrindo...
            </>
          ) : requiresTablePhone ? (
            "Voltar às Mesas"
          ) : tableMode ? (
            "Abrir Comanda"
          ) : (
            "Finalizar Venda"
          )}
        </button>
      </div>
    </div>
  );
}
