"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Ticket,
  Plus,
  Search,
  X,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Clock,
  Ban,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VoucherUsage {
  id: string;
  saleId: string;
  amount: number;
  createdAt: string;
}

interface VoucherCustomer {
  id: string;
  name: string | null;
  phone: string;
}

interface VoucherData {
  id: string;
  code: string;
  type: "EXCHANGE" | "GIFT";
  originalValue: number;
  balance: number;
  status: "ACTIVE" | "USED" | "EXPIRED" | "CANCELLED";
  customerId: string | null;
  customer: VoucherCustomer | null;
  expiresAt: string;
  createdAt: string;
  usages: VoucherUsage[];
}

interface CustomerSearchResult {
  id: string;
  name: string | null;
  phone: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: "bg-green-500/20", text: "text-green-400", label: "Ativo" },
  USED: { bg: "bg-slate-500/20", text: "text-slate-400", label: "Usado" },
  EXPIRED: { bg: "bg-red-500/20", text: "text-red-400", label: "Expirado" },
  CANCELLED: { bg: "bg-red-500/20", text: "text-red-400", label: "Cancelado" },
};

const TYPE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  EXCHANGE: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Troca" },
  GIFT: { bg: "bg-purple-500/20", text: "text-purple-400", label: "Presente" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("pt-BR");
}

// ─── Create Voucher Modal ───────────────────────────────────────────────────

function CreateVoucherModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (voucher: VoucherData) => void;
}) {
  const [value, setValue] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerSearch, setCustomerSearch] = useState<CustomerSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setValue("");
    setExpiresInDays("90");
    setCustomerPhone("");
    setCustomerSearch([]);
    setSelectedCustomer(null);
    setError(null);
    setCreatedCode(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const searchCustomer = async (phone: string) => {
    if (phone.length < 4) {
      setCustomerSearch([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/customers/search?phone=${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data) ? data : data.data ?? [];
        setCustomerSearch(results);
      }
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const handleCreate = async () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setError("Valor inválido.");
      return;
    }

    const days = parseInt(expiresInDays, 10);
    if (isNaN(days) || days <= 0) {
      setError("Validade em dias inválida.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "GIFT",
          originalValue: numValue,
          customerId: selectedCustomer?.id,
          expiresInDays: days,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao criar vale.");
        return;
      }

      const data = await res.json();
      setCreatedCode(data.code);
      onCreated(data);
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!createdCode) return;
    try {
      await navigator.clipboard.writeText(createdCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-600">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-pure-white flex items-center gap-2">
            <Ticket size={22} className="text-brand-green" />
            Novo Vale-Presente
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="touch-target min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-pure-white hover:bg-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {createdCode ? (
          <div className="text-center space-y-4">
            <CheckCircle size={48} className="text-brand-green mx-auto" />
            <p className="text-slate-300">Vale criado com sucesso!</p>
            <div className="bg-slate-700 rounded-xl p-4">
              <p className="text-3xl font-bold text-brand-green font-mono tracking-widest">
                {createdCode}
              </p>
            </div>
            <button
              type="button"
              onClick={copyCode}
              className="touch-target min-h-[44px] px-4 flex items-center gap-2 mx-auto rounded-lg bg-slate-600 hover:bg-slate-500 text-pure-white text-sm"
            >
              {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
              {copied ? "Copiado!" : "Copiar código"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full touch-target min-h-[44px] bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold rounded-xl"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Value */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Valor (R$)
              </label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                step="0.01"
                min="0.01"
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-pure-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green text-lg"
              />
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Validade (dias)
              </label>
              <input
                type="number"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                min="1"
                className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-pure-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>

            {/* Customer search */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Cliente (opcional)
              </label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-brand-green/10 border border-brand-green/30">
                  <div>
                    <p className="text-pure-white font-medium">{selectedCustomer.name || selectedCustomer.phone}</p>
                    <p className="text-sm text-slate-400">{selectedCustomer.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerPhone("");
                    }}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => {
                      setCustomerPhone(e.target.value);
                      searchCustomer(e.target.value);
                    }}
                    placeholder="Buscar por telefone ou nome..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-pure-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green"
                  />
                  {searching && (
                    <Loader2
                      size={18}
                      className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
                    />
                  )}
                  {customerSearch.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-xl overflow-hidden z-10 max-h-40 overflow-y-auto">
                      {customerSearch.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerSearch([]);
                            setCustomerPhone("");
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-600 text-pure-white text-sm"
                        >
                          {c.name || c.phone} — {c.phone}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="w-full touch-target min-h-[48px] bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:text-slate-400 text-primary-dark font-bold text-lg rounded-xl transition-colors"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin mx-auto" />
              ) : (
                "Criar Vale"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Voucher Detail Row ─────────────────────────────────────────────────────

function VoucherRow({ voucher }: { voucher: VoucherData }) {
  const [expanded, setExpanded] = useState(false);

  const statusBadge = STATUS_BADGE[voucher.status] ?? STATUS_BADGE.ACTIVE;
  const typeBadge = TYPE_BADGE[voucher.type] ?? TYPE_BADGE.GIFT;

  return (
    <>
      <tr
        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <td className="px-4 py-3 font-mono text-sm text-pure-white tracking-wide">
          {voucher.code}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge.bg} ${typeBadge.text}`}
          >
            {typeBadge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-300 text-sm">
          {formatCurrency(voucher.originalValue)}
        </td>
        <td className="px-4 py-3 text-brand-green font-semibold text-sm">
          {formatCurrency(voucher.balance)}
        </td>
        <td className="px-4 py-3 text-slate-400 text-sm">
          {formatDate(voucher.expiresAt)}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}
          >
            {statusBadge.label}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-300 text-sm">
          {voucher.customer?.name || voucher.customer?.phone || "—"}
        </td>
        <td className="px-4 py-3">
          {expanded ? (
            <ChevronUp size={18} className="text-slate-400" />
          ) : (
            <ChevronDown size={18} className="text-slate-400" />
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="px-4 py-4 bg-slate-800/50">
            <div className="space-y-2">
              <p className="text-sm text-slate-400">
                Criado em: {formatDateTime(voucher.createdAt)}
              </p>
              {voucher.usages.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-slate-300 mb-2">
                    Histórico de uso:
                  </p>
                  <div className="space-y-1">
                    {voucher.usages.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between text-sm bg-slate-700/50 rounded-lg px-3 py-2"
                      >
                        <span className="text-slate-400">
                          {formatDateTime(u.createdAt)}
                        </span>
                        <span className="text-red-400 font-medium">
                          -{formatCurrency(u.amount)}
                        </span>
                        <span className="text-slate-500 text-xs">
                          Venda: {u.saleId.slice(0, 8)}...
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Nenhum uso registrado.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<VoucherData[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [codeSearch, setCodeSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (codeSearch.trim()) params.set("code", codeSearch.trim());
      params.set("limit", "50");

      const res = await fetch(`/api/vouchers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVouchers(data.data);
        setTotal(data.meta.total);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter, codeSearch]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  // Summary cards
  const activeVouchers = vouchers.filter((v) => v.status === "ACTIVE");
  const totalBalance = activeVouchers.reduce((sum, v) => sum + v.balance, 0);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const expiredThisMonth = vouchers.filter(
    (v) =>
      v.status === "EXPIRED" &&
      new Date(v.expiresAt) >= startOfMonth
  ).length;

  return (
    <div className="min-h-screen bg-primary-dark p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Ticket size={28} className="text-brand-green" />
            <h1 className="text-2xl font-bold text-pure-white">Vales</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="touch-target min-h-[44px] px-4 flex items-center gap-2 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold transition-colors"
          >
            <Plus size={18} />
            Novo Vale-Presente
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={18} className="text-green-400" />
              <span className="text-sm text-slate-400">Vales Ativos</span>
            </div>
            <p className="text-2xl font-bold text-pure-white">
              {activeVouchers.length}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={18} className="text-brand-green" />
              <span className="text-sm text-slate-400">Saldo Total</span>
            </div>
            <p className="text-2xl font-bold text-brand-green">
              {formatCurrency(totalBalance)}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={18} className="text-red-400" />
              <span className="text-sm text-slate-400">Expirados (mês)</span>
            </div>
            <p className="text-2xl font-bold text-pure-white">
              {expiredThisMonth}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={codeSearch}
              onChange={(e) => setCodeSearch(e.target.value)}
              placeholder="Buscar por código..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-pure-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-pure-white focus:outline-none focus:ring-2 focus:ring-brand-green"
          >
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativo</option>
            <option value="USED">Usado</option>
            <option value="EXPIRED">Expirado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-brand-green" />
            </div>
          ) : vouchers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Ban size={48} className="mb-4 opacity-50" />
              <p>Nenhum vale encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Código
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Valor Original
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Saldo
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Validade
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <VoucherRow key={v.id} voucher={v} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > vouchers.length && (
            <div className="px-4 py-3 border-t border-white/5 text-sm text-slate-400 text-center">
              Mostrando {vouchers.length} de {total} vales
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <CreateVoucherModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          fetchVouchers();
        }}
      />
    </div>
  );
}
