"use client";

import { useEffect } from "react";
import { X, ChevronUp } from "lucide-react";
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
      <div
        className="fixed inset-0 bg-black/60 z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-slate-800 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col animate-slide-up"
        role="dialog"
        aria-label="Carrinho"
      >
        <div className="flex items-center justify-center py-2">
          <div className="w-12 h-1 rounded-full bg-slate-600" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="font-bold text-white text-lg">Carrinho</h2>
          <button
            type="button"
            onClick={onClose}
            className="touch-target min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
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

        <div className="p-4 border-t border-slate-600/50 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">Total</span>
            <span className="text-2xl font-bold text-white">
              R$ {total.toFixed(2)}
            </span>
          </div>
          <button
            type="button"
            disabled={cart.length === 0}
            onClick={onFinishSale}
            className="touch-target w-full min-h-[56px] bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-primary-dark font-bold text-lg rounded-xl transition-colors"
          >
            Finalizar Venda
          </button>
        </div>
      </div>
    </>
  );
}
