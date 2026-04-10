"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

export interface ProductFormData {
  id?: string;
  name: string;
  barcode: string;
  cost_price: string;
  sell_price: string;
  stock_quantity: string;
  min_stock: string;
  category: string;
  image_url: string;
}

const EMPTY_FORM: ProductFormData = {
  name: "",
  barcode: "",
  cost_price: "",
  sell_price: "",
  stock_quantity: "",
  min_stock: "",
  category: "",
  image_url: "",
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

  const isEditing = !!editProduct?.id;

  useEffect(() => {
    if (isOpen) {
      setForm(editProduct ?? EMPTY_FORM);
      setError(null);
    }
  }, [isOpen, editProduct]);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
        image_url: form.image_url.trim() || null,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-pure-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-primary-dark">
            {isEditing ? "Editar Produto" : "Novo Produto"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do Produto *
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ex: Coca-Cola 350ml"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Código de Barras (EAN) *
            </label>
            <input
              name="barcode"
              value={form.barcode}
              onChange={handleChange}
              placeholder="Ex: 7894900011517"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estoque Atual
              </label>
              <input
                name="stock_quantity"
                type="number"
                min="0"
                value={form.stock_quantity}
                onChange={handleChange}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estoque Mínimo
              </label>
              <input
                name="min_stock"
                type="number"
                min="0"
                value={form.min_stock}
                onChange={handleChange}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categoria *
              </label>
              <input
                name="category"
                value={form.category}
                onChange={handleChange}
                placeholder="Ex: Bebidas"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL da Imagem (opcional)
            </label>
            <input
              name="image_url"
              value={form.image_url}
              onChange={handleChange}
              placeholder="https://..."
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 font-bold placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-primary-dark font-bold py-3 rounded-2xl transition-colors duration-200 text-sm flex items-center justify-center gap-2"
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
