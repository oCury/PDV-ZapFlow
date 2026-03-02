"use client";

import { useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import type { CartItem } from "@/lib/validations/pos";
import { QuantityKeypad } from "./quantity-keypad";

interface CartItemCardProps {
  item: CartItem;
  onQuantityChange: (id: string, quantity: number) => void;
  onPriceOverride?: (id: string, unitPrice: number) => void;
  onRemove: (id: string) => void;
  allowPriceOverride?: boolean;
}

export function CartItemCard({
  item,
  onQuantityChange,
  onPriceOverride,
  onRemove,
  allowPriceOverride = false,
}: CartItemCardProps) {
  const [showQuantityEdit, setShowQuantityEdit] = useState(false);
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [priceOverride, setPriceOverride] = useState(item.unit_price.toString());

  const subtotal = item.quantity * item.unit_price;

  const handlePriceConfirm = () => {
    const val = parseFloat(priceOverride);
    if (!isNaN(val) && val >= 0 && onPriceOverride) {
      onPriceOverride(item.id, val);
    }
    setShowPriceEdit(false);
  };

  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-700/50 border border-slate-600/50">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">{item.name}</p>
          <div className="flex items-center gap-2 mt-1">
            {!showPriceEdit ? (
              <button
                type="button"
                onClick={() => allowPriceOverride && setShowPriceEdit(true)}
                className={`text-sm ${allowPriceOverride ? "hover:text-brand-green cursor-pointer" : "cursor-default"}`}
              >
                {item.quantity}x R$ {item.unit_price.toFixed(2)}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="w-24 px-2 py-1 rounded bg-slate-600 text-white font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={handlePriceConfirm}
                  className="text-xs bg-brand-green text-primary-dark px-2 py-1 rounded font-medium"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-lg font-bold text-brand-green shrink-0">
          R$ {subtotal.toFixed(2)}
        </p>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="touch-target min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {showQuantityEdit ? (
        <div className="flex items-center justify-between pt-2 border-t border-slate-600">
          <QuantityKeypad
            value={item.quantity}
            onChange={(q) => onQuantityChange(item.id, q)}
            min={1}
          />
          <button
            type="button"
            onClick={() => setShowQuantityEdit(false)}
            className="text-sm text-slate-400 hover:text-white"
          >
            OK
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowQuantityEdit(true)}
          className="touch-target min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-slate-600/50 text-slate-300 hover:bg-slate-600 text-sm font-medium"
        >
          <Pencil size={16} />
          Alterar quantidade
        </button>
      )}
    </div>
  );
}
