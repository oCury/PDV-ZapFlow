"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { VariantGridManager } from "./variant-grid-manager";

export interface ProductFormData {
  id?: string;
  name: string;
  barcode: string;
  cost_price: string;
  sell_price: string;
  stock_quantity: string;
  min_stock: string;
  category: string;
  category_id: string;
  image_url: string;
  ncm: string;
  cfop: string;
  fiscal_unit: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  children?: Category[];
}

interface Variant {
  id: string;
  sku: string;
  size: string;
  color: string | null;
  stock_quantity: number;
  sell_price: number | null;
}

const EMPTY_FORM: ProductFormData = {
  name: "",
  barcode: "",
  cost_price: "",
  sell_price: "",
  stock_quantity: "",
  min_stock: "",
  category: "",
  category_id: "",
  image_url: "",
  ncm: "",
  cfop: "",
  fiscal_unit: "",
};

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editProduct?: ProductFormData | null;
}

export function ProductModal({
  isOpen,
  onClose,
  onSaved,
  editProduct,
}: ProductModalProps) {
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [parentCatId, setParentCatId] = useState<string>("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const parentInitialized = useRef(false);

  const isEditing = !!editProduct?.id;

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data: Category[] = await res.json();
        setCategories(data.filter((c) => !c.parent_id));
      }
    } catch {
      // Categories are optional enhancement
    }
  }, []);

  const fetchVariants = useCallback(async () => {
    if (!editProduct?.id) return;
    try {
      const res = await fetch(`/api/products/${editProduct.id}/variants`);
      if (res.ok) {
        const data = await res.json();
        setVariants(data.variants || []);
      }
    } catch {
      // Variants fetch is best-effort
    }
  }, [editProduct?.id]);

  useEffect(() => {
    if (isOpen) {
      setForm(editProduct ?? EMPTY_FORM);
      setError(null);
      setVariants([]);
      setParentCatId("");
      parentInitialized.current = false;
      fetchCategories();
      if (editProduct?.id) {
        fetchVariants();
      }
    }
  }, [isOpen, editProduct, fetchCategories, fetchVariants]);

  // Derive parentCatId when editing an existing product after categories load
  useEffect(() => {
    if (parentInitialized.current || !editProduct?.category_id || categories.length === 0) return;
    parentInitialized.current = true;
    for (const rootCat of categories) {
      if (rootCat.id === editProduct.category_id) {
        setParentCatId(rootCat.id);
        return;
      }
      if (rootCat.children?.some((c) => c.id === editProduct.category_id)) {
        setParentCatId(rootCat.id);
        return;
      }
    }
  }, [categories, editProduct?.category_id]);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "category_id") {
      const cat = categories.find((c) => c.id === value);
      setForm((prev) => ({
        ...prev,
        category_id: value,
        category: cat?.name || prev.category,
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.barcode || !form.sell_price || !form.category) {
      setError("Preencha todos os campos obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        barcode: form.barcode.trim(),
        cost_price: parseFloat(form.cost_price) || 0,
        sell_price: parseFloat(form.sell_price),
        stock_quantity: parseInt(form.stock_quantity) || 0,
        min_stock: parseInt(form.min_stock) || 0,
        category: form.category.trim(),
        category_id: form.category_id || null,
        image_url: form.image_url.trim() || null,
        ncm: form.ncm.trim() || null,
        cfop: form.cfop.trim() || null,
        fiscal_unit: form.fiscal_unit.trim() || null,
      };

      const url = isEditing ? `/api/products/${editProduct!.id}` : "/api/products";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao salvar produto.");
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError("Erro de conexão ao salvar produto.");
    } finally {
      setSaving(false);
    }
  };

  const handleParentCategorySelect = (id: string) => {
    setParentCatId(id);
    const parent = categories.find((c) => c.id === id);
    if (!parent) {
      setForm((prev) => ({ ...prev, category_id: "", category: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, category_id: parent.id, category: parent.name }));
  };

  const handleSubCategorySelect = (childId: string) => {
    const parent = categories.find((c) => c.id === parentCatId);
    const child = parent?.children?.find((c) => c.id === childId);
    if (child) {
      setForm((prev) => ({ ...prev, category_id: child.id, category: child.name }));
    }
  };

  const selectedParentChildren = categories.find((c) => c.id === parentCatId)?.children ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-pure-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-primary-dark dark:text-white">
            {isEditing ? "Editar Produto" : "Novo Produto"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-sm font-medium px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Nome do Produto *
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ex: Camiseta Malha Peruana"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Código de Barras (EAN) *
            </label>
            <input
              name="barcode"
              value={form.barcode}
              onChange={handleChange}
              placeholder="Ex: 7894900011517"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm font-mono text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Preço de Custo (R$)
              </label>
              <input
                name="cost_price"
                type="number"
                step="0.01"
                min="0"
                value={form.cost_price}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Preço de Venda (R$) *
              </label>
              <input
                name="sell_price"
                type="number"
                step="0.01"
                min="0"
                value={form.sell_price}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Estoque Atual
              </label>
              <input
                name="stock_quantity"
                type="number"
                min="0"
                value={form.stock_quantity}
                onChange={handleChange}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Estoque Mínimo
              </label>
              <input
                name="min_stock"
                type="number"
                min="0"
                value={form.min_stock}
                onChange={handleChange}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
          </div>

          {/* Category cascade: group → subtype */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Categoria *
            </label>
            {categories.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={parentCatId}
                  onChange={(e) => handleParentCategorySelect(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
                >
                  <option value="">Selecionar grupo...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {parentCatId && selectedParentChildren.length > 0 && (
                  <select
                    value={selectedParentChildren.some((c) => c.id === form.category_id) ? form.category_id : ""}
                    onChange={(e) => handleSubCategorySelect(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-brand-green/40 dark:border-brand-green/30 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
                  >
                    <option value="">Selecionar tipo (opcional)...</option>
                    {selectedParentChildren.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <input
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="Ex: Camisetas"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              URL da Imagem (opcional)
            </label>
            <input
              name="image_url"
              value={form.image_url}
              onChange={handleChange}
              placeholder="https://..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
            />
          </div>

          {/* Fiscal data */}
          <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">
              Dados Fiscais
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  NCM
                </label>
                <input
                  name="ncm"
                  value={form.ncm}
                  onChange={handleChange}
                  placeholder="00000000"
                  maxLength={8}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm font-mono text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  CFOP
                </label>
                <input
                  name="cfop"
                  value={form.cfop}
                  onChange={handleChange}
                  placeholder="5102"
                  maxLength={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm font-mono text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Unidade
                </label>
                <input
                  name="fiscal_unit"
                  value={form.fiscal_unit}
                  onChange={handleChange}
                  placeholder="UN"
                  maxLength={6}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 dark:bg-slate-700 text-sm font-mono text-gray-900 dark:text-white font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
                />
              </div>
            </div>
          </div>

          {/* Variant management (only when editing) */}
          {isEditing && editProduct?.id && (
            <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
              <VariantGridManager
                productId={editProduct.id}
                variants={variants}
                onRefresh={fetchVariants}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-600 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-primary-dark font-bold py-3 rounded-2xl transition-colors duration-200 text-sm flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {isEditing ? "Salvar Alterações" : "Salvar Produto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
