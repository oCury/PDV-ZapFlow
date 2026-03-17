"use client";

import { useEffect } from "react";
import { X, Phone, Loader2 } from "lucide-react";
import type { CartItem } from "@/lib/validations/pos";
import { CartItemCard } from "./cart-item-card";

interface CartBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  total: number;
  onQuantityChange: (id: string, quantity: number) => void;
  onPriceOverride?: (id: string, unitPrice: number) => void;
  onRemove: (id: string) => void;
  onFinishSale: () => void;
  allowPriceOverride?: boolean;
  tableMode?: { tableNumber: number; phone: string };
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

export function CartBottomSheet({
  isOpen,
  onClose,
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
}: CartBottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet — sits above backdrop (z-50) and above the bottom nav (z-50 ties, sheet wins) */}
      <div
        className="fixed left-0 right-0 z-50 lg:hidden bg-slate-800 rounded-t-3xl shadow-2xl flex flex-col animate-slide-up"
        style={{
          bottom: 0,
          maxHeight: "88vh",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
        role="dialog"
        aria-label="Carrinho"
      >
        {/* Drag handle */}
        <div className="flex items-center justify-center pt-3 pb-1 shrink-0">
          <div className="w-12 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 shrink-0">
          <div>
            <h2 className="font-bold text-white text-lg">
              {tableMode ? `Mesa ${tableMode.tableNumber}` : "Carrinho"}
              {cart.length > 0 && (
                <span className="ml-2 text-sm font-normal text-slate-400">
                  ({cart.length} {cart.length === 1 ? "item" : "itens"})
                </span>
              )}
            </h2>
            {tableMode && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <Phone size={12} />
                {formatPhone(tableMode.phone)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
          {cart.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
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

        {/* Footer */}
        <div className="shrink-0 px-4 pt-3 pb-4 border-t border-slate-600/50 space-y-3">
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
            className={`touch-target w-full min-h-[56px] rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-colors ${
              requiresTablePhone
                ? "bg-slate-600 hover:bg-slate-500 text-slate-200 active:scale-[0.98]"
                : "bg-brand-green hover:bg-brand-green-hover active:bg-brand-green-muted disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-primary-dark"
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
    </>
  );
}
