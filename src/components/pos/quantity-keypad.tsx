"use client";

import { Minus, Plus } from "lucide-react";

interface QuantityKeypadProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function QuantityKeypad({
  value,
  onChange,
  min = 1,
  max = 999,
}: QuantityKeypadProps) {
  const inc = () => onChange(Math.min(max, value + 1));
  const dec = () => onChange(Math.max(min, value - 1));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        className="touch-target min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
      >
        <Minus size={24} className="text-white" />
      </button>
      <span className="min-w-[64px] text-center text-2xl font-bold text-white font-mono">
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        className="touch-target min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
      >
        <Plus size={24} className="text-white" />
      </button>
    </div>
  );
}
