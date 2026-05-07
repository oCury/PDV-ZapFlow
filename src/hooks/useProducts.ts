"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  ncm: string | null;
  cfop: string | null;
  fiscal_unit: string | null;
  variants?: ProductVariant[];
}

const CACHE_KEY = "useProducts_cache_v1";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedProducts(): Product[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < CACHE_TTL) return data;
  } catch { /* ignore */ }
  return null;
}

function setCachedProducts(data: Product[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore quota errors */ }
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(() => getCachedProducts() ?? []);
  const [loading, setLoading] = useState(() => getCachedProducts() === null);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Falha ao carregar produtos");
      const data: Product[] = await res.json();
      if (isMounted.current) {
        setProducts(data);
        setCachedProducts(data);
      }
    } catch {
      if (isMounted.current) setError("Erro ao carregar produtos.");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedProducts();
    if (cached) {
      setProducts(cached);
      setLoading(false);
      // Background revalidate
      fetchProducts();
    } else {
      fetchProducts();
    }
  }, [fetchProducts]);

  return { products, loading, error, refetch: fetchProducts };
}
