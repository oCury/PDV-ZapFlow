"use client";

import { useState } from "react";
import { X, Package, ShoppingCart } from "lucide-react";
import type { Product, ProductVariant } from "@/hooks/useProducts";

interface VariantSelectorModalProps {
  isOpen: boolean;
  product: Product;
  onClose: () => void;
  onSelect: (product: Product, variant: ProductVariant) => void;
}

export function VariantSelectorModal({
  isOpen,
  product,
  onClose,
  onSelect,
}: VariantSelectorModalProps) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  if (!isOpen || !product.variants?.length) return null;

  const sizes = [...new Set(product.variants.map((v) => v.size))];
  const colors = [...new Set(product.variants.filter((v) => v.color).map((v) => v.color!))];

  const filteredBySize = selectedSize
    ? product.variants.filter((v) => v.size === selectedSize)
    : product.variants;

  const filteredVariants = selectedColor
    ? filteredBySize.filter((v) => v.color === selectedColor)
    : filteredBySize;

  const selectedVariant =
    selectedSize && (colors.length === 0 || selectedColor)
      ? filteredVariants[0]
      : null;

  const handleSelect = () => {
    if (selectedVariant && selectedVariant.stock_quantity > 0) {
      onSelect(product, selectedVariant);
      setSelectedSize(null);
      setSelectedColor(null);
      onClose();
    }
  };

  const effectivePrice = selectedVariant?.sell_price ?? product.sell_price;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-12 h-12 rounded-xl object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center">
                <Package size={24} className="text-slate-500" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-white text-base">{product.name}</h3>
              <p className="text-brand-green font-bold text-lg">
                R$ {effectivePrice.toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Size selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Tamanho
            </label>
            <div className="flex flex-wrap gap-2">
              {sizes.map((size) => {
                const hasStock = product.variants!.some(
                  (v) =>
                    v.size === size &&
                    (!selectedColor || v.color === selectedColor) &&
                    v.stock_quantity > 0
                );

                return (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size === selectedSize ? null : size)}
                    disabled={!hasStock}
                    className={`min-w-[48px] px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      selectedSize === size
                        ? "bg-brand-green text-primary-dark scale-105"
                        : hasStock
                          ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                          : "bg-slate-800 text-slate-600 cursor-not-allowed line-through"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color selector */}
          {colors.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Cor / Estampa
              </label>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => {
                  const hasStock = product.variants!.some(
                    (v) =>
                      v.color === color &&
                      (!selectedSize || v.size === selectedSize) &&
                      v.stock_quantity > 0
                  );

                  return (
                    <button
                      key={color}
                      onClick={() =>
                        setSelectedColor(color === selectedColor ? null : color)
                      }
                      disabled={!hasStock}
                      className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        selectedColor === color
                          ? "bg-brand-green text-primary-dark scale-105"
                          : hasStock
                            ? "bg-slate-700 text-slate-200 hover:bg-slate-600"
                            : "bg-slate-800 text-slate-600 cursor-not-allowed line-through"
                      }`}
                    >
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected variant info */}
          {selectedVariant && (
            <div className="bg-slate-700/50 rounded-xl p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">SKU</span>
                <span className="text-slate-200 font-mono">{selectedVariant.sku}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Estoque</span>
                <span
                  className={`font-bold ${
                    selectedVariant.stock_quantity <= 0
                      ? "text-red-400"
                      : selectedVariant.stock_quantity <= (selectedVariant.min_stock || 5)
                        ? "text-amber-400"
                        : "text-emerald-400"
                  }`}
                >
                  {selectedVariant.stock_quantity} un.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-700">
          <button
            onClick={handleSelect}
            disabled={!selectedVariant || selectedVariant.stock_quantity <= 0}
            className="w-full min-h-[52px] rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-primary-dark font-bold text-base flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
          >
            <ShoppingCart size={20} />
            {!selectedVariant
              ? "Selecione tamanho e cor"
              : selectedVariant.stock_quantity <= 0
                ? "Sem estoque"
                : "Adicionar ao Carrinho"}
          </button>
        </div>
      </div>
    </div>
  );
}
