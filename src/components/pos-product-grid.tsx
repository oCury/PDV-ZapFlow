"use client";

import { useState } from "react";
import { Package, Loader2, PlusCircle } from "lucide-react";
import type { Product } from "@/hooks/useProducts";

interface PosProductGridProps {
  products: Product[];
  loading: boolean;
  error: string | null;
  onProductClick: (product: Product) => void;
  onAddNewProduct?: () => void;
}

export function PosProductGrid({
  products,
  loading,
  error,
  onProductClick,
  onAddNewProduct,
}: PosProductGridProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(products.map((p) => p.category))].sort();

  const filtered = selectedCategory
    ? products.filter((p) => p.category === selectedCategory)
    : products;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        Carregando produtos...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={onAddNewProduct}
          className="mt-3 text-sm text-brand-green hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <Package size={48} className="mx-auto text-gray-300" />
        <p className="text-gray-500 font-medium">
          Nenhum produto cadastrado
        </p>
        <p className="text-gray-400 text-sm">
          Cadastre produtos para exibi-los aqui.
        </p>
        {onAddNewProduct && (
          <button
            onClick={onAddNewProduct}
            className="inline-flex items-center gap-2 bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold px-5 py-2.5 rounded-2xl transition-colors duration-200 text-sm mt-2"
          >
            <PlusCircle size={18} />
            Cadastrar Produto
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              !selectedCategory
                ? "bg-brand-green text-primary-dark"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                selectedCategory === cat
                  ? "bg-brand-green text-primary-dark"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map((product) => (
          <PosCard
            key={product.id}
            product={product}
            onClick={() => onProductClick(product)}
          />
        ))}
      </div>
    </div>
  );
}

function PosCard({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  const outOfStock = product.stock_quantity <= 0;

  return (
    <button
      onClick={onClick}
      disabled={outOfStock}
      className="group relative bg-primary-dark rounded-2xl overflow-hidden text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(1,240,90,0.15)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none focus:outline-none focus:ring-2 focus:ring-brand-green/50"
    >
      <div className="relative h-24 bg-gray-800 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <Package
            size={32}
            className="text-gray-600 group-hover:text-gray-500 transition-colors"
          />
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-xs font-bold text-red-400">SEM ESTOQUE</span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1">
        <h3 className="text-sm font-bold text-pure-white leading-tight line-clamp-2">
          {product.name}
        </h3>
        <p className="text-lg font-bold text-brand-green">
          R$ {product.sell_price.toFixed(2)}
        </p>
        <p className="text-[11px] text-gray-400">
          {product.stock_quantity} un.
        </p>
      </div>

      <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-brand-green/30 transition-colors pointer-events-none" />
    </button>
  );
}
