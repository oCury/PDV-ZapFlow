"use client";

import { useState } from "react";
import { Package, Loader2, PlusCircle, Grid3X3 } from "lucide-react";
import type { Product, ProductVariant } from "@/hooks/useProducts";
import { VariantSelectorModal } from "@/components/variant-selector-modal";

interface PosProductGridProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  onProductClick: (product: Product) => void;
  onVariantClick?: (product: Product, variant: ProductVariant) => void;
  onAddNewProduct?: () => void;
}

export function PosProductGrid({
  products,
  loading,
  error,
  onProductClick,
  onVariantClick,
  onAddNewProduct,
}: PosProductGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);

  const categories = [...new Set(products.map((p) => p.category))].sort();
  const filtered = selectedCategory
    ? products.filter((p) => p.category === selectedCategory)
    : products;

  const handleProductClick = (product: Product) => {
    if (product.has_variants && product.variants?.length) {
      setVariantProduct(product);
    } else {
      onProductClick(product);
    }
  };

  const handleVariantSelect = (product: Product, variant: ProductVariant) => {
    if (onVariantClick) {
      onVariantClick(product, variant);
    }
    setVariantProduct(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={32} className="animate-spin mr-3" />
        <span className="text-lg">Carregando produtos...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 text-base">{error}</p>
        {onAddNewProduct && (
          <button
            onClick={onAddNewProduct}
            className="mt-4 touch-target min-h-[48px] px-6 rounded-xl bg-brand-green text-primary-dark font-semibold"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <Package size={56} className="mx-auto text-slate-500" />
        <p className="text-slate-300 font-medium text-lg">Nenhum produto cadastrado</p>
        <p className="text-slate-400 text-sm">Cadastre produtos para exibi-los aqui.</p>
        {onAddNewProduct && (
          <button
            onClick={onAddNewProduct}
            className="touch-target min-h-[52px] inline-flex items-center gap-2 bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold px-6 py-3 rounded-2xl transition-colors"
          >
            <PlusCircle size={22} />
            Cadastrar Produto
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {[null, ...categories].map((cat) => (
            <button
              key={cat ?? "__all__"}
              onClick={() => setSelectedCategory(cat)}
              className={`touch-target min-h-[40px] sm:min-h-[48px] shrink-0 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-brand-green text-primary-dark"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {cat ?? "Todos"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 content-start">
          {filtered.map((product) => (
            <PosProductCard
              key={product.id}
              product={product}
              onClick={() => handleProductClick(product)}
            />
          ))}
        </div>
      </div>

      {variantProduct && (
        <VariantSelectorModal
          isOpen={!!variantProduct}
          product={variantProduct}
          onClose={() => setVariantProduct(null)}
          onSelect={handleVariantSelect}
        />
      )}
    </>
  );
}

function PosProductCard({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  // For variant products, calculate total stock from variants
  const totalStock = product.has_variants && product.variants?.length
    ? product.variants.reduce((sum, v) => sum + v.stock_quantity, 0)
    : product.stock_quantity;

  const outOfStock = totalStock <= 0;
  const minStock = product.min_stock || 5;
  const lowStock = totalStock > 0 && totalStock <= minStock;

  const stockColor = outOfStock
    ? "text-red-500"
    : lowStock
      ? "text-amber-400"
      : "text-emerald-400";

  const variantCount = product.variants?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={outOfStock}
      className="touch-target group relative bg-slate-700/80 rounded-2xl overflow-hidden text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-brand-green/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus:outline-none focus:ring-2 focus:ring-brand-green/50"
    >
      <div className="relative aspect-square min-h-[90px] sm:min-h-[120px] bg-slate-800 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <>
            <Package size={32} className="text-slate-500 sm:hidden" />
            <Package size={48} className="text-slate-500 hidden sm:block" />
          </>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-xs sm:text-sm font-bold text-red-400">SEM ESTOQUE</span>
          </div>
        )}
        {product.has_variants && variantCount > 0 && (
          <div className="absolute top-1.5 right-1.5 bg-brand-green/90 text-primary-dark text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-0.5">
            <Grid3X3 size={10} />
            {variantCount}
          </div>
        )}
      </div>

      <div className="p-2 sm:p-4 space-y-0.5 sm:space-y-1">
        <h3 className="text-xs sm:text-base font-bold text-white leading-tight line-clamp-2">
          {product.name}
        </h3>
        <p className="text-sm sm:text-xl font-bold text-brand-green">
          R$ {product.sell_price.toFixed(2)}
        </p>
        <p className={`text-[10px] sm:text-xs font-bold ${stockColor}`}>
          {totalStock} un.
        </p>
      </div>

      <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-brand-green/30 transition-colors pointer-events-none" />
    </button>
  );
}
