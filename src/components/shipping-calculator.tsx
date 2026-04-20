"use client";

import { useState } from "react";
import { Truck, Loader2, MapPin, Edit3 } from "lucide-react";

interface ShippingOption {
  method: string;
  label: string;
  price: number;
  estimated_days: string;
}

interface ShippingCalculatorProps {
  itemCount: number;
  onShippingSelect: (option: ShippingOption | null) => void;
  selectedMethod: string | null;
}

export function ShippingCalculator({
  itemCount,
  onShippingSelect,
  selectedMethod,
}: ShippingCalculatorProps) {
  const [cep, setCep] = useState("");
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualMethod, setManualMethod] = useState("TRANSPORTADORA");

  const formatCep = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length > 5) {
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }
    return digits;
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCep(formatCep(e.target.value));
  };

  const calculateShipping = async () => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) {
      setError("CEP deve ter 8 dígitos.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/shipping/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cep: cleanCep,
          items: Array.from({ length: itemCount }, () => ({ quantity: 1 })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao calcular frete.");
        return;
      }

      const data: ShippingOption[] = await res.json();
      setOptions(data);
    } catch {
      setError("Erro de conexão ao calcular frete.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = () => {
    const price = parseFloat(manualValue);
    if (isNaN(price) || price < 0) {
      setError("Valor de frete inválido.");
      return;
    }

    const manualOption: ShippingOption = {
      method: manualMethod,
      label: manualMethod === "MOTOBOY" ? "Motoboy" : "Transportadora",
      price,
      estimated_days: "A combinar",
    };

    onShippingSelect(manualOption);
  };

  return (
    <div className="bg-slate-700/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck size={18} className="text-brand-green" />
          <h3 className="text-sm font-bold text-slate-200">Frete</h3>
        </div>
        <button
          onClick={() => {
            setManualMode(!manualMode);
            setError(null);
          }}
          className="text-xs text-slate-400 hover:text-brand-green flex items-center gap-1 transition-colors"
        >
          <Edit3 size={12} />
          {manualMode ? "Calcular por CEP" : "Inserir manualmente"}
        </button>
      </div>

      {manualMode ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={manualMethod}
              onChange={(e) => setManualMethod(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40"
            >
              <option value="TRANSPORTADORA">Transportadora</option>
              <option value="MOTOBOY">Motoboy</option>
              <option value="CORREIOS">Correios</option>
              <option value="RETIRADA">Retirada</option>
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="R$ 0,00"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40"
              />
              <button
                onClick={handleManualSubmit}
                className="px-3 py-2 rounded-lg bg-brand-green text-primary-dark text-sm font-bold hover:bg-brand-green-hover transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                value={cep}
                onChange={handleCepChange}
                placeholder="00000-000"
                maxLength={9}
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-green/40"
              />
            </div>
            <button
              onClick={calculateShipping}
              disabled={loading || cep.replace(/\D/g, "").length !== 8}
              className="px-4 py-2 rounded-lg bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-700 disabled:text-slate-500 text-primary-dark text-sm font-bold transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                "Calcular"
              )}
            </button>
          </div>

          {options.length > 0 && (
            <div className="space-y-1.5">
              {options.map((opt) => (
                <button
                  key={opt.method}
                  onClick={() => onShippingSelect(opt)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all ${
                    selectedMethod === opt.method
                      ? "bg-brand-green/20 border border-brand-green/50 text-white"
                      : "bg-slate-800 border border-slate-600 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className="text-left">
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {opt.estimated_days}
                    </span>
                  </div>
                  <span className="font-bold text-brand-green">
                    {opt.price === 0 ? "Grátis" : `R$ ${opt.price.toFixed(2)}`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-xs font-medium">{error}</p>
      )}

      {selectedMethod && (
        <button
          onClick={() => onShippingSelect(null)}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors"
        >
          Remover frete
        </button>
      )}
    </div>
  );
}
