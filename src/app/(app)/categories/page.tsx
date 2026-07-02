"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ChevronDown,
  Shirt,
  Tag,
  Sparkles,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  _count?: { products: number };
  children?: Category[];
}

// Sugestões prontas para loja de moda
const SUGGESTIONS = [
  { name: "Camisetas", emoji: "👕", children: ["Malha Peruana", "Algodão Premium", "Tactel", "Dry Fit"] },
  { name: "Calças", emoji: "👖", children: ["Jeans", "Moletom", "Alfaiataria", "Legging"] },
  { name: "Bermudas", emoji: "🩳", children: ["Tactel", "Jeans", "Sarja"] },
  { name: "Vestidos", emoji: "👗", children: ["Curto", "Longo", "Midi"] },
  { name: "Moletons", emoji: "🧥", children: ["Com Capuz", "Sem Capuz", "Canguru"] },
  { name: "Acessórios", emoji: "🎒", children: ["Bonés", "Cintos", "Bolsas", "Meias"] },
  { name: "Conjuntos", emoji: "👔", children: ["Masculino", "Feminino", "Infantil"] },
  { name: "Jaquetas", emoji: "🧥", children: ["Corta-Vento", "Jeans", "Couro"] },
];

const CATEGORY_COLORS = [
  "from-violet-500/20 to-violet-600/5 border-violet-500/30",
  "from-sky-500/20 to-sky-600/5 border-sky-500/30",
  "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30",
  "from-amber-500/20 to-amber-600/5 border-amber-500/30",
  "from-rose-500/20 to-rose-600/5 border-rose-500/30",
  "from-cyan-500/20 to-cyan-600/5 border-cyan-500/30",
  "from-fuchsia-500/20 to-fuchsia-600/5 border-fuchsia-500/30",
  "from-orange-500/20 to-orange-600/5 border-orange-500/30",
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editParentId, setEditParentId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [creatingSuggestion, setCreatingSuggestion] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCategories(data);
    } catch {
      setError("Erro ao carregar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/categories/${deleteConfirm.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Não foi possível excluir.");
        return;
      }
      await fetchCategories();
    } catch {
      alert("Sem conexão. Tente novamente.");
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const handleCreateSuggestion = async (suggestion: typeof SUGGESTIONS[0]) => {
    setCreatingSuggestion(suggestion.name);
    try {
      // Create parent
      const parentRes = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: suggestion.name }),
      });
      if (!parentRes.ok) {
        setCreatingSuggestion(null);
        return;
      }
      const parent = await parentRes.json();

      // Create children
      for (const child of suggestion.children) {
        await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: child, parent_id: parent.id }),
        });
      }

      await fetchCategories();
    } catch {
      // intentionally ignored
    } finally {
      setCreatingSuggestion(null);
    }
  };

  const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));
  const availableSuggestions = SUGGESTIONS.filter(
    (s) => !existingNames.has(s.name.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <div className="bg-brand-green/20 p-2 rounded-xl">
            <Shirt size={24} className="text-brand-green" />
          </div>
          Organizar Produtos
        </h1>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
          Separe seus produtos em grupos para facilitar na hora de vender.
          <br />
          <span className="text-slate-500">
            Exemplo: <strong className="text-slate-300">Camisetas</strong> pode ter dentro{" "}
            <strong className="text-slate-300">Malha Peruana</strong>,{" "}
            <strong className="text-slate-300">Algodão</strong>, etc.
          </span>
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setEditCategory(null);
            setEditParentId(null);
            setModalOpen(true);
          }}
          className="bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold px-5 py-3 rounded-2xl transition-all duration-200 text-sm flex items-center gap-2 active:scale-[0.97]"
        >
          <Plus size={18} />
          Criar Grupo
        </button>
        {availableSuggestions.length > 0 && (
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold px-5 py-3 rounded-2xl transition-all duration-200 text-sm flex items-center gap-2 border border-slate-600"
          >
            <Sparkles size={16} className="text-amber-400" />
            Sugestões Prontas
            <ChevronDown
              size={14}
              className={`transition-transform ${showSuggestions ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Suggestions */}
      {showSuggestions && availableSuggestions.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-4">
          <p className="text-xs text-slate-400 mb-3 font-medium">
            Toque em uma sugestão para criar o grupo com os tipos já prontos:
          </p>
          <div className="flex flex-wrap gap-2">
            {availableSuggestions.map((s) => (
              <button
                key={s.name}
                onClick={() => handleCreateSuggestion(s)}
                disabled={creatingSuggestion === s.name}
                className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 active:scale-[0.97] border border-slate-600"
              >
                {creatingSuggestion === s.name ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span className="text-base">{s.emoji}</span>
                )}
                {s.name}
                <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                  +{s.children.length} tipos
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-12">
          <p className="text-red-400 mb-3">{error}</p>
          <button
            onClick={fetchCategories}
            className="text-sm text-brand-green hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && categories.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <div className="bg-slate-800 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto">
            <Tag size={36} className="text-slate-600" />
          </div>
          <div>
            <p className="text-slate-300 font-semibold text-lg">
              Nenhum grupo criado ainda
            </p>
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
              Comece criando grupos para separar seus produtos.
              Use as <strong>sugestões prontas</strong> acima para começar rapidinho!
            </p>
          </div>
        </div>
      )}

      {/* Category cards */}
      {!loading && !error && categories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map((cat, index) => {
            const colorClass = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
            const productCount = cat._count?.products ?? 0;
            const childCount = cat.children?.length ?? 0;

            return (
              <div
                key={cat.id}
                className={`bg-gradient-to-br ${colorClass} rounded-2xl border p-4 transition-all hover:scale-[1.01]`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-white text-lg">{cat.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      {productCount > 0 && (
                        <span className="text-xs text-slate-400">
                          {productCount} produto{productCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {childCount > 0 && (
                        <span className="text-xs text-slate-400">
                          {childCount} tipo{childCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {productCount === 0 && childCount === 0 && (
                        <span className="text-xs text-slate-500">Grupo vazio</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditCategory(cat);
                        setEditParentId(null);
                        setModalOpen(true);
                      }}
                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: cat.id, name: cat.name })}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Children (sub-types) */}
                {childCount > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {cat.children!.map((child) => {
                      const childProducts = child._count?.products ?? 0;
                      return (
                        <div
                          key={child.id}
                          className="group relative bg-white/10 hover:bg-white/15 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors"
                        >
                          <span>{child.name}</span>
                          {childProducts > 0 && (
                            <span className="text-[10px] text-slate-400">
                              ({childProducts})
                            </span>
                          )}
                          <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                            <button
                              onClick={() => {
                                setEditCategory(child);
                                setEditParentId(cat.id);
                                setModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-white transition-colors"
                            >
                              <Pencil size={10} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm({ id: child.id, name: child.name })}
                              className="text-slate-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add sub-type button */}
                <button
                  onClick={() => {
                    setEditCategory(null);
                    setEditParentId(cat.id);
                    setModalOpen(true);
                  }}
                  className="w-full py-2 rounded-xl border border-dashed border-white/20 text-xs font-medium text-slate-400 hover:text-white hover:border-white/40 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus size={12} />
                  Adicionar tipo
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      {modalOpen && (
        <CategoryModal
          category={editCategory}
          parentId={editParentId}
          parentOptions={categories}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            fetchCategories();
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-red-500/20 p-2.5 rounded-xl">
                <AlertTriangle size={22} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">
                  Excluir &ldquo;{deleteConfirm.name}&rdquo;?
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">
                  Isso não pode ser desfeito.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-3 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryModal({
  category,
  parentId,
  parentOptions,
  onClose,
  onSaved,
}: {
  category: Category | null;
  parentId: string | null;
  parentOptions: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [selectedParentId, setSelectedParentId] = useState(
    parentId ?? category?.parent_id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!category?.id;
  const isSubType = !!selectedParentId;
  const parentName = parentOptions.find((c) => c.id === selectedParentId)?.name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Digite um nome para continuar.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = isEditing ? `/api/categories/${category.id}` : "/api/categories";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          parent_id: selectedParentId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Não foi possível salvar.");
        return;
      }

      onSaved();
    } catch {
      setError("Sem conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">
            {isEditing
              ? `Renomear "${category?.name}"`
              : isSubType
                ? `Novo tipo dentro de "${parentName}"`
                : "Novo grupo de produtos"
            }
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {isSubType
              ? "Ex: Malha Peruana, Algodão Premium, Dry Fit..."
              : "Ex: Camisetas, Calças, Bermudas, Vestidos..."
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 text-red-400 text-sm font-medium px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              {isSubType ? "Nome do tipo" : "Nome do grupo"}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isSubType ? "Ex: Malha Peruana" : "Ex: Camisetas"}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-slate-600 bg-slate-700 text-base text-white font-bold placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green/40 transition-all"
            />
          </div>

          {/* Only show parent picker when creating a new root category (not when adding sub-type) */}
          {!parentId && !isEditing && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Fica dentro de qual grupo?
              </label>
              <select
                value={selectedParentId}
                onChange={(e) => setSelectedParentId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-600 bg-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-green/40"
              >
                <option value="">Nenhum (é um grupo principal)</option>
                {parentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    Dentro de: {opt.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3.5 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-700 disabled:text-slate-500 text-primary-dark font-bold py-3.5 rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {isEditing ? "Salvar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
