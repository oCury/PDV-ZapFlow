"use client";

import { Delete, Minus, Plus } from "lucide-react";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  min?: number;
  max?: number;
  allowDecimals?: boolean;
  placeholder?: string;
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

export function NumericKeypad({
  value,
  onChange,
  onConfirm,
  allowDecimals = true,
  placeholder = "0",
}: NumericKeypadProps) {
  const handleKey = (key: string) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1) || "");
      return;
    }
    if (key === ".") {
      if (!allowDecimals || value.includes(".")) return;
      onChange(value ? `${value}.` : "0.");
      return;
    }
    if (value === "0" && key !== ".") {
      onChange(key);
      return;
    }
    onChange(`${value}${key}`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-[52px] px-4 py-3 rounded-xl bg-slate-700/50 text-right text-2xl font-mono font-bold text-white">
        {value || placeholder}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.flat().map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKey(key)}
            className="touch-target flex items-center justify-center rounded-xl bg-slate-600 hover:bg-slate-500 active:scale-95 transition-all text-white font-bold text-xl min-h-[52px]"
          >
            {key === "⌫" ? (
              <Delete size={24} className="text-slate-300" />
            ) : (
              key
            )}
          </button>
        ))}
      </div>
      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          className="touch-target w-full min-h-[52px] rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold text-lg transition-colors active:scale-[0.98]"
        >
          Confirmar
        </button>
      )}
    </div>
  );
}
