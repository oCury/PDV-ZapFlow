"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, Grid3X3 } from "lucide-react";

interface Variant {
  id: string;
  sku: string;
  size: string;
  color: string | null;
  stock_quantity: number;
  sell_price: number | null;
}

interface VariantGridManagerProps {
  productId: string;
  variants: Variant[];
  onRefresh: () => void;
}

const COMMON_SIZES = ["PP", "P", "M", "G", "GG", "XG"];
const COMMON_COLORS = ["Preto", "Branco", "Cinza", "Azul", "Vermelho", "Rosa", "Verde"];

export function VariantGridManager({
  productId,
  variants,
  onRefresh,
}: VariantGridManagerProps) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [stockPerVariant, setStockPerVariant] = useState("10");
  const [customSize, setCustomSize] = useState("");
  const [customColor, setCustomColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  const toggleColor = (color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  };

  const addCustomSize = () => {
    const trimmed = customSize.trim().toUpperCase();
    if (trimmed && !selectedSizes.includes(trimmed)) {
      setSelectedSizes((prev) => [...prev, trimmed]);
      setCustomSize("");
    }
  };

  const addCustomColor = () => {
    const trimmed = customColor.trim();
    if (trimmed && !selectedColors.includes(trimmed)) {
      setSelectedColors((prev) => [...prev, trimmed]);
      setCustomColor("");
    }
  };

  const handleBulkCreate = async () => {
    if (selectedSizes.length === 0) {
      setError("Selecione pelo menos um tamanho.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/products/${productId}/variants/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizes: selectedSizes,
          colors: selectedColors.length > 0 ? selectedColors : undefined,
          stock_per_variant: parseInt(stockPerVariant) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao criar variantes.");
        return;
      }

      setSelectedSizes([]);
      setSelectedColors([]);
      setBulkMode(false);
      onRefresh();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (variantId: string) => {
    setDeleting(variantId);
    try {
      const res = await fetch(
        `/api/products/${productId}/variants/${variantId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao excluir variante.");
        return;
      }
      onRefresh();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setDeleting(null);
    }
  };

  const previewCount =
    selectedSizes.length * Math.max(selectedColors.length, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Grid3X3 size={16} className="text-brand-green" />
          Grade de Variantes ({variants.length})
        </h3>
        <button
          type="button"
          onClick={() => setBulkMode(!bulkMode)}
          className="text-xs font-semibold text-brand-green hover:text-brand-green-hover flex items-center gap-1 transition-colors"
        >
          <Plus size={14} />
          {bulkMode ? "Cancelar" : "Gerar Grade"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 text-xs font-medium px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      {bulkMode && (
        <div className="bg-slate-700/50 rounded-xl p-4 space-y-4">
          {/* Sizes */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Tamanhos
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_SIZES.map((size) => (
                <button
                  type="button"
                  key={size}
                  onClick={() => toggleSize(size)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    selectedSizes.includes(size)
                      ? "bg-brand-green text-primary-dark"
                      : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                  }`}
                >
                  {size}
                </button>
              ))}
              <div className="flex gap-1">
                <input
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                  placeholder="Outro"
                  className="w-16 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-green/40"
                  onKeyDown={(e) => e.key === "Enter" && addCustomSize()}
                />
                <button
                  type="button"
                  onClick={addCustomSize}
                  className="px-2 py-1.5 rounded-lg bg-slate-600 text-slate-300 hover:bg-slate-500 text-xs"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Cores / Estampas (opcional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  onClick={() => toggleColor(color)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    selectedColors.includes(color)
                      ? "bg-brand-green text-primary-dark"
                      : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                  }`}
                >
                  {color}
                </button>
              ))}
              <div className="flex gap-1">
                <input
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  placeholder="Outro"
                  className="w-20 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-green/40"
                  onKeyDown={(e) => e.key === "Enter" && addCustomColor()}
                />
                <button
                  type="button"
                  onClick={addCustomColor}
                  className="px-2 py-1.5 rounded-lg bg-slate-600 text-slate-300 hover:bg-slate-500 text-xs"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Stock per variant */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Estoque por variante
            </label>
            <input
              type="number"
              min="0"
              value={stockPerVariant}
              onChange={(e) => setStockPerVariant(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-green/40"
            />
          </div>

          {/* Preview + Generate */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              {previewCount > 0
                ? `${previewCount} variante${previewCount > 1 ? "s" : ""} serão criadas`
                : "Selecione tamanhos para gerar"}
            </span>
            <button
              type="button"
              onClick={handleBulkCreate}
              disabled={saving || selectedSizes.length === 0}
              className="px-4 py-2 rounded-lg bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-700 disabled:text-slate-500 text-primary-dark text-sm font-bold transition-colors flex items-center gap-1.5"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Grid3X3 size={14} />
              )}
              Gerar Grade
            </button>
          </div>
        </div>
      )}

      {/* Existing variants table */}
      {variants.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs border-b border-slate-700">
                <th className="text-left py-2 px-2">SKU</th>
                <th className="text-left py-2 px-2">Tam.</th>
                <th className="text-left py-2 px-2">Cor</th>
                <th className="text-right py-2 px-2">Estoque</th>
                <th className="text-right py-2 px-2">Preço</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30"
                >
                  <td className="py-2 px-2 font-mono text-xs text-slate-300">
                    {v.sku}
                  </td>
                  <td className="py-2 px-2">
                    <span className="bg-slate-600 text-slate-200 px-2 py-0.5 rounded text-xs font-bold">
                      {v.size}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-slate-300">{v.color || "—"}</td>
                  <td
                    className={`py-2 px-2 text-right font-bold ${
                      v.stock_quantity <= 0
                        ? "text-red-400"
                        : v.stock_quantity <= 5
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}
                  >
                    {v.stock_quantity}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-300">
                    {v.sell_price != null ? `R$ ${v.sell_price.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(v.id)}
                      disabled={deleting === v.id}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      {deleting === v.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
