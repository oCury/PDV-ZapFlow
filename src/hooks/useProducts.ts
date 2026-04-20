"use client";

import { useState, useEffect, useCallback } from "react";

export interface ProductVariant {
  id: string;
  sku: string;
  size: string;
  color: string | null;
  model: string | null;
  barcode: string | null;
  stock_quantity: number;
  min_stock: number;
  cost_price: number | null;
  sell_price: number | null;
  image_url: string | null;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  sell_price: number;
  cost_price: number;
  stock_quantity: number;
  min_stock: number;
  category: string;
  category_id: string | null;
  has_variants: boolean;
  image_url: string | null;
  variants?: ProductVariant[];
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Falha ao carregar produtos");
      const data: Product[] = await res.json();
      setProducts(data);
    } catch {
      setError("Erro ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refetch: fetchProducts };
}
