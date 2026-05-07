"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeftRight,
  Search,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Eye,
  X,
  Package,
  Clock,
  DollarSign,
  AlertCircle,
  Check,
} from "lucide-react";
import { ExchangeStatusBadge } from "@/components/exchanges/exchange-status-badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExchangeableItem {
  saleItemId: string;
  productId: string;
  productName: string;
  variantId: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
  alreadyExchanged: number;
  availableQuantity: number;
}

interface ExchangeItemData {
  id: string;
  action: string;
  quantity: number;
  unit_price: number;
  original_item: {
    id: string;
    product_id: string;
    variant_id: string | null;
    quantity: number;
    unit_price: number;
    size: string | null;
    color: string | null;
    product: { name: string };
    variant: { size: string; color: string | null; sku: string } | null;
  };
}

interface ExchangeData {
  id: string;
  original_sale_id: string;
  status: string;
  reason: string;
  reason_detail: string | null;
  total_returned: number;
  credit_generated: number | null;
  refund_method: string | null;
  created_at: string;
  original_sale: {
    id: string;
    total_amount: number;
    created_at: string;
    customer: { id: string; name: string | null; phone: string } | null;
  };
  items: ExchangeItemData[];
  voucher: {
    id: string;
    code: string;
    balance: number;
    status: string;
  } | null;
}

interface SelectedItem {
  saleItemId: string;
  action: "RETURN" | "EXCHANGE";
  quantity: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const REASON_LABELS: Record<string, string> = {
  WRONG_SIZE: "Tamanho errado",
  DEFECT: "Defeito",
  DISLIKE: "Nao gostou",
  OTHER: "Outro",
};

const REFUND_LABELS: Record<string, string> = {
  VOUCHER: "Vale-troca",
  CASH: "Dinheiro",
  ORIGINAL_METHOD: "Metodo original",
};

const WIZARD_STEPS = [
  "Buscar Venda",
  "Selecionar Itens",
  "Motivo e Reembolso",
  "Confirmar",
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ExchangesPage() {
  // Page state
  const [activeTab, setActiveTab] = useState<"new" | "history">("history");
  const [loading, setLoading] = useState(true);

  // Summary cards
  const [todayCount, setTodayCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);

  // History
  const [exchanges, setExchanges] = useState<ExchangeData[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [detailExchange, setDetailExchange] = useState<ExchangeData | null>(
    null
  );

  // Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [saleIdSearch, setSaleIdSearch] = useState("");
  const [searchError, setSearchError] = useState("");
  const [searchingItems, setSearchingItems] = useState(false);
  const [exchangeableItems, setExchangeableItems] = useState<
    ExchangeableItem[]
  >([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [reason, setReason] = useState<string>("WRONG_SIZE");
  const [reasonDetail, setReasonDetail] = useState("");
  const [refundMethod, setRefundMethod] = useState<string>("VOUCHER");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
    voucherCode?: string;
  } | null>(null);

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-pure-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all";

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchExchanges = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);

      const res = await fetch(`/api/exchanges?${params.toString()}`);
      if (res.ok) {
        const data: ExchangeData[] = await res.json();
        setExchanges(data);

        // Calculate summaries
        const today = new Date().toDateString();
        const todayExchanges = data.filter(
          (e) => new Date(e.created_at).toDateString() === today
        );
        setTodayCount(todayExchanges.length);

        const pending = data.filter((e) => e.status === "PENDING");
        setPendingCount(pending.length);

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthExchanges = data.filter(
          (e) =>
            new Date(e.created_at) >= monthStart &&
            e.status === "COMPLETED"
        );
        setMonthTotal(
          monthExchanges.reduce((sum, e) => sum + e.total_returned, 0)
        );
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchExchanges();
  }, [fetchExchanges]);

  // ─── Wizard Handlers ───────────────────────────────────────────────────

  const handleSearchSale = async () => {
    if (!saleIdSearch.trim()) return;
    setSearchError("");
    setSearchingItems(true);

    try {
      const res = await fetch(
        `/api/sales/${encodeURIComponent(saleIdSearch.trim())}/exchangeable`
      );

      if (!res.ok) {
        const data = await res.json();
        setSearchError(data.error || "Erro ao buscar venda.");
        setSearchingItems(false);
        return;
      }

      const items: ExchangeableItem[] = await res.json();

      if (items.every((i) => i.availableQuantity <= 0)) {
        setSearchError("Todos os itens desta venda ja foram trocados.");
        setSearchingItems(false);
        return;
      }

      setExchangeableItems(items);
      setSelectedItems([]);
      setWizardStep(1);
    } catch {
      setSearchError("Erro de conexao ao buscar venda.");
    } finally {
      setSearchingItems(false);
    }
  };

  const toggleItemSelection = (saleItemId: string) => {
    setSelectedItems((prev) => {
      const exists = prev.find((si) => si.saleItemId === saleItemId);
      if (exists) {
        return prev.filter((si) => si.saleItemId !== saleItemId);
      }
      const item = exchangeableItems.find((i) => i.saleItemId === saleItemId);
      if (!item || item.availableQuantity <= 0) return prev;
      return [
        ...prev,
        { saleItemId, action: "RETURN" as const, quantity: 1 },
      ];
    });
  };

  const updateSelectedQuantity = (saleItemId: string, quantity: number) => {
    const item = exchangeableItems.find((i) => i.saleItemId === saleItemId);
    if (!item) return;
    const clamped = Math.max(1, Math.min(quantity, item.availableQuantity));
    setSelectedItems((prev) =>
      prev.map((si) =>
        si.saleItemId === saleItemId ? { ...si, quantity: clamped } : si
      )
    );
  };

  const updateSelectedAction = (
    saleItemId: string,
    action: "RETURN" | "EXCHANGE"
  ) => {
    setSelectedItems((prev) =>
      prev.map((si) =>
        si.saleItemId === saleItemId ? { ...si, action } : si
      )
    );
  };

  const calculateTotal = (): number => {
    return selectedItems.reduce((sum, si) => {
      const item = exchangeableItems.find(
        (i) => i.saleItemId === si.saleItemId
      );
      return sum + (item ? item.unitPrice * si.quantity : 0);
    }, 0);
  };

  const handleSubmitExchange = async () => {
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await fetch("/api/exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalSaleId: saleIdSearch.trim(),
          reason,
          reasonDetail: reason === "OTHER" ? reasonDetail : undefined,
          refundMethod,
          items: selectedItems.map((si) => ({
            originalItemId: si.saleItemId,
            action: si.action,
            quantity: si.quantity,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitResult({ success: false, message: data.error });
        return;
      }

      const voucherCode = data.voucher?.code;
      setSubmitResult({
        success: true,
        message: "Troca realizada com sucesso!",
        voucherCode,
      });

      // Refresh history
      fetchExchanges();
    } catch {
      setSubmitResult({
        success: false,
        message: "Erro de conexao ao processar troca.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(0);
    setSaleIdSearch("");
    setSearchError("");
    setExchangeableItems([]);
    setSelectedItems([]);
    setReason("WRONG_SIZE");
    setReasonDetail("");
    setRefundMethod("VOUCHER");
    setSubmitResult(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-primary-dark p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="text-brand-green" size={28} />
          <h1 className="text-2xl font-bold text-pure-white">
            Trocas e Devolucoes
          </h1>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-green/20">
              <ArrowLeftRight className="text-brand-green" size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Trocas Hoje
              </p>
              <p className="text-xl font-bold text-pure-white">{todayCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-yellow-500/20">
              <Clock className="text-yellow-400" size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Pendentes
              </p>
              <p className="text-xl font-bold text-pure-white">
                {pendingCount}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20">
              <DollarSign className="text-emerald-400" size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Devolvido (Mes)
              </p>
              <p className="text-xl font-bold text-pure-white">
                {formatCurrency(monthTotal)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab("new");
            resetWizard();
          }}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === "new"
              ? "bg-brand-green text-primary-dark"
              : "bg-white/5 text-gray-400 hover:text-pure-white hover:bg-white/10"
          }`}
        >
          Nova Troca
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            activeTab === "history"
              ? "bg-brand-green text-primary-dark"
              : "bg-white/5 text-gray-400 hover:text-pure-white hover:bg-white/10"
          }`}
        >
          Historico
        </button>
      </div>

      {/* ─── New Exchange Wizard ─────────────────────────────────────────── */}
      {activeTab === "new" && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {WIZARD_STEPS.map((step, idx) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                    idx < wizardStep
                      ? "bg-brand-green text-primary-dark"
                      : idx === wizardStep
                      ? "bg-brand-green/30 text-brand-green border border-brand-green"
                      : "bg-white/10 text-gray-500"
                  }`}
                >
                  {idx < wizardStep ? (
                    <Check size={14} />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-xs hidden sm:block ${
                    idx <= wizardStep ? "text-pure-white" : "text-gray-500"
                  }`}
                >
                  {step}
                </span>
                {idx < WIZARD_STEPS.length - 1 && (
                  <ChevronRight
                    size={14}
                    className="text-gray-600 hidden sm:block"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Submit result */}
          {submitResult && (
            <div
              className={`p-4 rounded-xl mb-4 border ${
                submitResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}
            >
              <p className="font-medium">{submitResult.message}</p>
              {submitResult.voucherCode && (
                <p className="mt-1 text-sm">
                  Vale-troca gerado:{" "}
                  <span className="font-mono font-bold text-brand-green">
                    {submitResult.voucherCode}
                  </span>
                </p>
              )}
              {submitResult.success && (
                <button
                  type="button"
                  onClick={() => {
                    resetWizard();
                    setActiveTab("history");
                  }}
                  className="mt-3 px-4 py-1.5 rounded-lg bg-brand-green text-primary-dark text-sm font-medium hover:bg-brand-green-hover transition-colors"
                >
                  Ver Historico
                </button>
              )}
            </div>
          )}

          {/* Step 0: Search Sale */}
          {wizardStep === 0 && !submitResult?.success && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-pure-white">
                Buscar Venda Original
              </h3>
              <p className="text-sm text-gray-400">
                Informe o ID da venda para iniciar a troca.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={saleIdSearch}
                    onChange={(e) => setSaleIdSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearchSale();
                    }}
                    placeholder="ID da venda (ex: cm...)"
                    className={inputCls}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSearchSale}
                  disabled={searchingItems || !saleIdSearch.trim()}
                  className="px-5 py-2.5 rounded-xl bg-brand-green text-primary-dark font-medium text-sm hover:bg-brand-green-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {searchingItems ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                  Buscar
                </button>
              </div>
              {searchError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle size={16} />
                  {searchError}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Select Items */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-pure-white">
                Selecionar Itens para Troca
              </h3>
              <p className="text-sm text-gray-400">
                Marque os itens e informe a quantidade.
              </p>

              <div className="space-y-3">
                {exchangeableItems.map((item) => {
                  const isDisabled = item.availableQuantity <= 0;
                  const selected = selectedItems.find(
                    (si) => si.saleItemId === item.saleItemId
                  );

                  return (
                    <div
                      key={item.saleItemId}
                      className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                        selected
                          ? "border-brand-green/50 bg-brand-green/5"
                          : isDisabled
                          ? "border-white/5 bg-white/[0.02] opacity-50"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!selected}
                        disabled={isDisabled}
                        onChange={() => toggleItemSelection(item.saleItemId)}
                        className="w-5 h-5 rounded accent-brand-green"
                      />

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-pure-white truncate">
                          {item.productName}
                        </p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-400">
                          {item.size && <span>Tam: {item.size}</span>}
                          {item.color && <span>Cor: {item.color}</span>}
                          <span>
                            Qtd original: {item.quantity}
                          </span>
                          <span>
                            Disponivel: {item.availableQuantity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatCurrency(item.unitPrice)} / un.
                        </p>
                      </div>

                      {selected && (
                        <div className="flex items-center gap-3">
                          <select
                            value={selected.action}
                            onChange={(e) =>
                              updateSelectedAction(
                                item.saleItemId,
                                e.target.value as "RETURN" | "EXCHANGE"
                              )
                            }
                            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-pure-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-green"
                          >
                            <option value="RETURN">Devolucao</option>
                            <option value="EXCHANGE">Troca</option>
                          </select>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedQuantity(
                                  item.saleItemId,
                                  selected.quantity - 1
                                )
                              }
                              className="w-7 h-7 rounded-lg bg-white/10 text-pure-white text-sm hover:bg-white/20 transition-colors flex items-center justify-center"
                            >
                              -
                            </button>
                            <span className="w-8 text-center text-sm text-pure-white font-medium">
                              {selected.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedQuantity(
                                  item.saleItemId,
                                  selected.quantity + 1
                                )
                              }
                              className="w-7 h-7 rounded-lg bg-white/10 text-pure-white text-sm hover:bg-white/20 transition-colors flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(0)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-pure-white transition-colors"
                >
                  <ChevronLeft size={16} /> Voltar
                </button>
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() => setWizardStep(2)}
                  className="px-5 py-2.5 rounded-xl bg-brand-green text-primary-dark font-medium text-sm hover:bg-brand-green-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  Continuar <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Reason & Refund */}
          {wizardStep === 2 && (
            <div className="space-y-5">
              <h3 className="text-lg font-semibold text-pure-white">
                Motivo e Metodo de Reembolso
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Motivo da troca
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className={inputCls}
                  >
                    <option value="WRONG_SIZE">Tamanho errado</option>
                    <option value="DEFECT">Defeito</option>
                    <option value="DISLIKE">Nao gostou</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </div>

                {reason === "OTHER" && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1.5">
                      Detalhe do motivo
                    </label>
                    <textarea
                      value={reasonDetail}
                      onChange={(e) => setReasonDetail(e.target.value)}
                      maxLength={500}
                      rows={3}
                      className={inputCls}
                      placeholder="Descreva o motivo..."
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Metodo de reembolso
                  </label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className={inputCls}
                  >
                    <option value="VOUCHER">Vale-troca (valido por 90 dias)</option>
                    <option value="CASH">Dinheiro</option>
                    <option value="ORIGINAL_METHOD">Metodo original</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-pure-white transition-colors"
                >
                  <ChevronLeft size={16} /> Voltar
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  className="px-5 py-2.5 rounded-xl bg-brand-green text-primary-dark font-medium text-sm hover:bg-brand-green-hover transition-colors flex items-center gap-1"
                >
                  Continuar <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Summary & Confirm */}
          {wizardStep === 3 && !submitResult?.success && (
            <div className="space-y-5">
              <h3 className="text-lg font-semibold text-pure-white">
                Confirmar Troca
              </h3>

              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Venda Original</span>
                  <span className="text-pure-white font-mono">
                    {saleIdSearch.trim()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Motivo</span>
                  <span className="text-pure-white">
                    {REASON_LABELS[reason] ?? reason}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Reembolso</span>
                  <span className="text-pure-white">
                    {REFUND_LABELS[refundMethod] ?? refundMethod}
                  </span>
                </div>

                <hr className="border-white/10" />

                <p className="text-xs text-gray-400 uppercase tracking-wide">
                  Itens
                </p>
                {selectedItems.map((si) => {
                  const item = exchangeableItems.find(
                    (i) => i.saleItemId === si.saleItemId
                  );
                  if (!item) return null;
                  return (
                    <div
                      key={si.saleItemId}
                      className="flex justify-between text-sm"
                    >
                      <div className="text-pure-white">
                        <span>{item.productName}</span>
                        {item.size && (
                          <span className="text-gray-400 ml-1">
                            ({item.size}
                            {item.color ? ` / ${item.color}` : ""})
                          </span>
                        )}
                        <span className="text-gray-400 ml-2">
                          x{si.quantity}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          [{si.action === "RETURN" ? "Devolucao" : "Troca"}]
                        </span>
                      </div>
                      <span className="text-pure-white">
                        {formatCurrency(item.unitPrice * si.quantity)}
                      </span>
                    </div>
                  );
                })}

                <hr className="border-white/10" />

                <div className="flex justify-between text-base font-bold">
                  <span className="text-pure-white">Total</span>
                  <span className="text-brand-green">
                    {formatCurrency(calculateTotal())}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-pure-white transition-colors"
                >
                  <ChevronLeft size={16} /> Voltar
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitExchange}
                  className="px-6 py-2.5 rounded-xl bg-brand-green text-primary-dark font-semibold text-sm hover:bg-brand-green-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  Confirmar Troca
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── History Tab ─────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-pure-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40"
            >
              <option value="">Todos os status</option>
              <option value="PENDING">Pendentes</option>
              <option value="COMPLETED">Concluidas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2
                size={32}
                className="animate-spin text-brand-green"
              />
            </div>
          ) : exchanges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Package size={48} className="mb-3 opacity-50" />
              <p className="text-sm">Nenhuma troca encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
                      Data
                    </th>
                    <th className="text-left py-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
                      Venda Original
                    </th>
                    <th className="text-left py-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
                      Itens
                    </th>
                    <th className="text-left py-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
                      Valor
                    </th>
                    <th className="text-left py-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
                      Metodo
                    </th>
                    <th className="text-left py-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-center py-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {exchanges.map((ex) => (
                    <tr
                      key={ex.id}
                      className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="py-3 px-4 text-gray-300">
                        {formatDate(ex.created_at)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-300">
                        {ex.original_sale_id.slice(0, 12)}...
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {ex.items.length} item(ns)
                      </td>
                      <td className="py-3 px-4 text-pure-white font-medium">
                        {formatCurrency(ex.total_returned)}
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {REFUND_LABELS[ex.refund_method ?? ""] ??
                          ex.refund_method}
                      </td>
                      <td className="py-3 px-4">
                        <ExchangeStatusBadge status={ex.status} />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setDetailExchange(ex)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-pure-white transition-colors"
                          title="Ver detalhes"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Detail Modal ────────────────────────────────────────────────── */}
      {detailExchange && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-primary-dark border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-lg font-bold text-pure-white">
                Detalhes da Troca
              </h2>
              <button
                type="button"
                onClick={() => setDetailExchange(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-pure-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Status</p>
                  <ExchangeStatusBadge status={detailExchange.status} />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Data</p>
                  <p className="text-pure-white">
                    {formatDate(detailExchange.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Motivo</p>
                  <p className="text-pure-white">
                    {REASON_LABELS[detailExchange.reason] ??
                      detailExchange.reason}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Reembolso</p>
                  <p className="text-pure-white">
                    {REFUND_LABELS[detailExchange.refund_method ?? ""] ??
                      detailExchange.refund_method}
                  </p>
                </div>
              </div>

              {detailExchange.reason_detail && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Detalhe</p>
                  <p className="text-sm text-gray-300">
                    {detailExchange.reason_detail}
                  </p>
                </div>
              )}

              {detailExchange.original_sale.customer && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Cliente</p>
                  <p className="text-sm text-pure-white">
                    {detailExchange.original_sale.customer.name ??
                      detailExchange.original_sale.customer.phone}
                  </p>
                </div>
              )}

              <hr className="border-white/10" />

              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                  Itens
                </p>
                <div className="space-y-2">
                  {detailExchange.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center text-sm p-3 bg-white/[0.03] rounded-xl"
                    >
                      <div>
                        <p className="text-pure-white font-medium">
                          {item.original_item.product.name}
                        </p>
                        <div className="flex gap-2 mt-0.5 text-xs text-gray-400">
                          {item.original_item.variant && (
                            <>
                              <span>
                                {item.original_item.variant.size}
                              </span>
                              {item.original_item.variant.color && (
                                <span>
                                  {item.original_item.variant.color}
                                </span>
                              )}
                            </>
                          )}
                          <span>x{item.quantity}</span>
                          <span className="text-gray-500">
                            [{item.action === "RETURN"
                              ? "Devolucao"
                              : "Troca"}]
                          </span>
                        </div>
                      </div>
                      <span className="text-pure-white">
                        {formatCurrency(item.unit_price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="border-white/10" />

              <div className="flex justify-between text-base font-bold">
                <span className="text-pure-white">Total Devolvido</span>
                <span className="text-brand-green">
                  {formatCurrency(detailExchange.total_returned)}
                </span>
              </div>

              {detailExchange.voucher && (
                <div className="p-3 bg-brand-green/10 border border-brand-green/30 rounded-xl">
                  <p className="text-xs text-brand-green uppercase tracking-wide mb-1">
                    Vale-Troca Gerado
                  </p>
                  <p className="font-mono font-bold text-brand-green text-lg">
                    {detailExchange.voucher.code}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Saldo: {formatCurrency(detailExchange.voucher.balance)} -{" "}
                    <ExchangeStatusBadge
                      status={detailExchange.voucher.status}
                    />
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
