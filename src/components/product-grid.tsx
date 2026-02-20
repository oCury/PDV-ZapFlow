"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { ProductCard, type ProductCardProps } from "./product-card";

interface ProductGridProps {
  products: Omit<ProductCardProps, "onAddToCart" | "onEdit" | "onDelete">[];
  onAddToCart?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ProductGrid({ products, onAddToCart, onEdit, onDelete }: ProductGridProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [...new Set(products.map((p) => p.category))];

  const filtered = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.barcode.includes(search);
    const matchesCategory =
      !selectedCategory || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar por nome ou código de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-pure-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              !selectedCategory
                ? "bg-brand-green text-primary-dark"
                : "bg-pure-white text-gray-500 border border-gray-200 hover:border-brand-green"
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-brand-green text-primary-dark"
                  : "bg-pure-white text-gray-500 border border-gray-200 hover:border-brand-green"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">Nenhum produto encontrado</p>
          <p className="text-sm mt-1">Tente ajustar sua busca ou filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              {...product}
              onAddToCart={onAddToCart}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
