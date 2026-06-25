"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Percent,
  Plus,
  Loader2,
  X,
  Trash2,
  Edit3,
  DollarSign,
  Search,
  TrendingUp,
  Layers,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StaffUser {
  id: string;
  name: string;
  email: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface CategoryRule {
  id: string;
  category_id: string;
  percent: number;
  category: { id: string; name: string };
}

interface Tier {
  id: string;
  min_revenue: number;
  max_revenue: number | null;
  percent: number;
}

interface CommissionRule {
  id: string;
  user_id: string;
  type: "FIXED_PERCENT" | "CATEGORY_PERCENT" | "TIERED";
  default_percent: number;
  active: boolean;
  created_at: string;
  user: { id: string; name: string };
  category_rules: CategoryRule[];
  tiers: Tier[];
}

interface CommissionResult {
  userId: string;
  userName: string;
  totalSales: number;
  salesCount: number;
  commissionAmount: number;
  commissionPercent: number;
  ruleType: string;
  details: { saleId: string; amount: number; commission: number }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  FIXED_PERCENT: "Percentual Fixo",
  CATEGORY_PERCENT: "Por Categoria",
  TIERED: "Escalonada",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CommissionsPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Commission calculation state
  const [calcUserId, setCalcUserId] = useState("");
  const [calcStartDate, setCalcStartDate] = useState(getMonthRange().startDate);
  const [calcEndDate, setCalcEndDate] = useState(getMonthRange().endDate);
  const [calcResult, setCalcResult] = useState<CommissionResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Form state
  const [formUserId, setFormUserId] = useState("");
  const [formType, setFormType] = useState<"FIXED_PERCENT" | "CATEGORY_PERCENT" | "TIERED">("FIXED_PERCENT");
  const [formDefaultPercent, setFormDefaultPercent] = useState(5);
  const [formCategoryRules, setFormCategoryRules] = useState<{ categoryId: string; percent: number }[]>([]);
  const [formTiers, setFormTiers] = useState<{ minRevenue: number; maxRevenue: number | undefined; percent: number }[]>([]);

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all";

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/commissions/rules");
      if (res.ok) setRules(await res.json());
    } catch {
      // intentionally ignored
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/staff");
      if (res.ok) {
        const data = await res.json();
        setStaff(data.filter((u: StaffUser & { active: boolean }) => u.active));
      }
    } catch {
      // intentionally ignored
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) setCategories(await res.json());
    } catch {
      // intentionally ignored
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchStaff();
    fetchCategories();
  }, [fetchRules, fetchStaff, fetchCategories]);

  const resetForm = () => {
    setFormUserId("");
    setFormType("FIXED_PERCENT");
    setFormDefaultPercent(5);
    setFormCategoryRules([]);
    setFormTiers([]);
    setEditingRule(null);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (rule: CommissionRule) => {
    setEditingRule(rule);
    setFormUserId(rule.user_id);
    setFormType(rule.type);
    setFormDefaultPercent(Number(rule.default_percent));
    setFormCategoryRules(
      rule.category_rules.map((cr) => ({
        categoryId: cr.category_id,
        percent: Number(cr.percent),
      }))
    );
    setFormTiers(
      rule.tiers.map((t) => ({
        minRevenue: Number(t.min_revenue),
        maxRevenue: t.max_revenue ? Number(t.max_revenue) : undefined,
        percent: Number(t.percent),
      }))
    );
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      userId: formUserId,
      type: formType,
      defaultPercent: formDefaultPercent,
      categoryRules: formType === "CATEGORY_PERCENT" ? formCategoryRules : undefined,
      tiers: formType === "TIERED" ? formTiers : undefined,
    };

    try {
      const url = editingRule
        ? `/api/commissions/rules/${editingRule.id}`
        : "/api/commissions/rules";
      const method = editingRule ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao salvar regra.");
        return;
      }

      setModalOpen(false);
      resetForm();
      fetchRules();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Desativar esta regra de comissão?")) return;
    await fetch(`/api/commissions/rules/${id}`, { method: "DELETE" });
    fetchRules();
  };

  const handleCalculate = async () => {
    if (!calcUserId) return;
    setCalculating(true);
    setCalcResult(null);
    try {
      const params = new URLSearchParams({
        userId: calcUserId,
        startDate: calcStartDate,
        endDate: calcEndDate,
      });
      const res = await fetch(`/api/commissions/calculate?${params}`);
      if (res.ok) setCalcResult(await res.json());
    } catch {
      // intentionally ignored
    } finally {
      setCalculating(false);
    }
  };

  const addCategoryRule = () => {
    setFormCategoryRules([...formCategoryRules, { categoryId: "", percent: 5 }]);
  };

  const updateCategoryRule = (index: number, field: "categoryId" | "percent", value: string | number) => {
    const updated = formCategoryRules.map((cr, i) =>
      i === index ? { ...cr, [field]: value } : cr
    );
    setFormCategoryRules(updated);
  };

  const removeCategoryRule = (index: number) => {
    setFormCategoryRules(formCategoryRules.filter((_, i) => i !== index));
  };

  const addTier = () => {
    setFormTiers([...formTiers, { minRevenue: 0, maxRevenue: undefined, percent: 5 }]);
  };

  const updateTier = (index: number, field: string, value: number | undefined) => {
    const updated = formTiers.map((t, i) =>
      i === index ? { ...t, [field]: value } : t
    );
    setFormTiers(updated);
  };

  const removeTier = (index: number) => {
    setFormTiers(formTiers.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Comissões</h1>
          <p className="text-slate-400 text-sm mt-1">
            Gerencie regras de comissão e calcule valores por período
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold px-5 py-2.5 rounded-2xl transition-colors duration-200 text-sm flex items-center gap-2"
        >
          <Plus size={18} />
          Nova Regra
        </button>
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando regras...
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Percent size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="font-medium">Nenhuma regra de comissão cadastrada</p>
          <p className="text-sm mt-1">Crie uma regra para começar</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-slate-800 rounded-2xl p-5 border border-slate-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-brand-green/10">
                    <Percent size={22} className="text-brand-green" />
                  </div>
                  <div>
                    <h3 className="text-slate-100 font-semibold">
                      {rule.user.name}
                    </h3>
                    <p className="text-slate-400 text-sm">
                      {TYPE_LABELS[rule.type]} &middot;{" "}
                      {Number(rule.default_percent)}% base
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(rule)}
                    className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-brand-green transition-colors"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rule.id)}
                    className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Category rules preview */}
              {rule.type === "CATEGORY_PERCENT" && rule.category_rules.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {rule.category_rules.map((cr) => (
                    <span
                      key={cr.id}
                      className="text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg"
                    >
                      {cr.category.name}: {Number(cr.percent)}%
                    </span>
                  ))}
                </div>
              )}

              {/* Tiers preview */}
              {rule.type === "TIERED" && rule.tiers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {rule.tiers.map((t) => (
                    <span
                      key={t.id}
                      className="text-xs bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg"
                    >
                      {formatCurrency(Number(t.min_revenue))}
                      {t.max_revenue ? ` - ${formatCurrency(Number(t.max_revenue))}` : "+"}: {Number(t.percent)}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Commission Calculator */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <DollarSign size={20} className="text-brand-green" />
          Calcular Comissão
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Vendedor</label>
            <select
              value={calcUserId}
              onChange={(e) => setCalcUserId(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione...</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Data Início</label>
            <input
              type="date"
              value={calcStartDate}
              onChange={(e) => setCalcStartDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Data Fim</label>
            <input
              type="date"
              value={calcEndDate}
              onChange={(e) => setCalcEndDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleCalculate}
              disabled={!calcUserId || calculating}
              className="w-full bg-brand-green hover:bg-brand-green-hover disabled:opacity-50 text-primary-dark font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              {calculating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              Calcular
            </button>
          </div>
        </div>

        {calcResult && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-700/50 rounded-xl p-4">
                <p className="text-xs text-slate-400">Vendas</p>
                <p className="text-xl font-bold text-slate-100">{calcResult.salesCount}</p>
              </div>
              <div className="bg-slate-700/50 rounded-xl p-4">
                <p className="text-xs text-slate-400">Total Vendido</p>
                <p className="text-xl font-bold text-slate-100">
                  {formatCurrency(calcResult.totalSales)}
                </p>
              </div>
              <div className="bg-slate-700/50 rounded-xl p-4">
                <p className="text-xs text-slate-400">Comissão</p>
                <p className="text-xl font-bold text-brand-green">
                  {formatCurrency(calcResult.commissionAmount)}
                </p>
              </div>
              <div className="bg-slate-700/50 rounded-xl p-4">
                <p className="text-xs text-slate-400">% Efetiva</p>
                <p className="text-xl font-bold text-brand-green">
                  {calcResult.commissionPercent}%
                </p>
              </div>
            </div>

            {calcResult.details.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700">
                      <th className="text-left py-2 px-3">Venda</th>
                      <th className="text-right py-2 px-3">Valor</th>
                      <th className="text-right py-2 px-3">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcResult.details.map((d) => (
                      <tr key={d.saleId} className="border-b border-slate-700/50">
                        <td className="py-2 px-3 text-slate-300 font-mono text-xs">
                          {d.saleId.slice(0, 12)}...
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">
                          {formatCurrency(d.amount)}
                        </td>
                        <td className="py-2 px-3 text-right text-brand-green">
                          {formatCurrency(d.commission)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingRule ? "Editar Regra" : "Nova Regra de Comissão"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 text-red-400 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1">Vendedor</label>
                <select
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">Selecione...</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">Tipo de Comissão</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as typeof formType)}
                  className={inputCls}
                >
                  <option value="FIXED_PERCENT">Percentual Fixo</option>
                  <option value="CATEGORY_PERCENT">Por Categoria</option>
                  <option value="TIERED">Escalonada</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Percentual Base (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={formDefaultPercent}
                  onChange={(e) => setFormDefaultPercent(Number(e.target.value))}
                  className={inputCls}
                  required
                />
              </div>

              {/* Category-specific rules */}
              {formType === "CATEGORY_PERCENT" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-400 flex items-center gap-1.5">
                      <Layers size={14} />
                      Regras por Categoria
                    </label>
                    <button
                      type="button"
                      onClick={addCategoryRule}
                      className="text-xs text-brand-green hover:text-brand-green-hover flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Adicionar
                    </button>
                  </div>
                  {formCategoryRules.map((cr, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={cr.categoryId}
                        onChange={(e) => updateCategoryRule(i, "categoryId", e.target.value)}
                        className={`${inputCls} flex-1`}
                      >
                        <option value="">Categoria...</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={cr.percent}
                        onChange={(e) => updateCategoryRule(i, "percent", Number(e.target.value))}
                        className={`${inputCls} w-24`}
                        placeholder="%"
                      />
                      <button
                        type="button"
                        onClick={() => removeCategoryRule(i)}
                        className="p-2 text-slate-500 hover:text-red-400"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Tiered rules */}
              {formType === "TIERED" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-400 flex items-center gap-1.5">
                      <TrendingUp size={14} />
                      Faixas de Faturamento
                    </label>
                    <button
                      type="button"
                      onClick={addTier}
                      className="text-xs text-brand-green hover:text-brand-green-hover flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Adicionar
                    </button>
                  </div>
                  {formTiers.map((t, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={t.minRevenue}
                        onChange={(e) => updateTier(i, "minRevenue", Number(e.target.value))}
                        className={`${inputCls} flex-1`}
                        placeholder="Min R$"
                      />
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={t.maxRevenue ?? ""}
                        onChange={(e) =>
                          updateTier(
                            i,
                            "maxRevenue",
                            e.target.value ? Number(e.target.value) : undefined
                          )
                        }
                        className={`${inputCls} flex-1`}
                        placeholder="Max R$ (vazio = sem teto)"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={t.percent}
                        onChange={(e) => updateTier(i, "percent", Number(e.target.value))}
                        className={`${inputCls} w-20`}
                        placeholder="%"
                      />
                      <button
                        type="button"
                        onClick={() => removeTier(i)}
                        className="p-2 text-slate-500 hover:text-red-400"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-white/5 text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !formUserId}
                  className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:opacity-50 text-primary-dark font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {editingRule ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
