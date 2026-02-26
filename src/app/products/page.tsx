"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, AlertTriangle, Eye } from "lucide-react";
import { ProductGrid } from "@/components/product-grid";
import { ProductModal, type ProductFormData } from "@/components/product-modal";
import { useProducts } from "@/hooks/useProducts";

export default function ProductsPage() {
  const { products, loading, error, refetch } = useProducts();
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductFormData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [role, setRole] = useState<"ADMIN" | "EMPLOYEE" | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  const isAdmin = role === "ADMIN";

  const handleEdit = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    setEditProduct({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      cost_price: product.cost_price.toString(),
      sell_price: product.sell_price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      category: product.category,
      image_url: product.image_url || "",
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erro ao excluir produto.");
        return;
      }
      await refetch();
    } catch {
      alert("Erro de conexão ao excluir produto.");
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const openNewProduct = () => {
    setEditProduct(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">Produtos</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isAdmin
              ? "Gerencie o catálogo de produtos"
              : "Consulte o catálogo de produtos"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isAdmin && role && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
              <Eye size={14} />
              Somente Leitura
            </span>
          )}
          {isAdmin && (
            <button
              onClick={openNewProduct}
              className="bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold px-5 py-2.5 rounded-2xl transition-colors duration-200 text-sm flex items-center gap-2"
            >
              <Plus size={18} />
              Novo Produto
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando produtos...
        </div>
      ) : error ? (
        <div className="text-red-500 p-4">{error}</div>
      ) : (
        <ProductGrid
          products={products}
          onEdit={isAdmin ? handleEdit : undefined}
          onDelete={isAdmin ? (id) => setDeleteConfirm(id) : undefined}
        />
      )}

      {isAdmin && (
        <ProductModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={refetch}
          editProduct={editProduct}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="relative bg-pure-white rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-100 p-2 rounded-xl">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-primary-dark">Excluir Produto</h3>
                <p className="text-sm text-gray-500">
                  Tem certeza? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-red-500 hover:bg-red-600 text-pure-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
