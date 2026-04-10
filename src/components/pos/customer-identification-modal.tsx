"use client";

import { useState } from "react";
import {
  Search,
  UserPlus,
  CheckCircle,
  Loader2,
  X,
  UserCheck,
  SkipForward,
} from "lucide-react";

interface CustomerData {
  id: string;
  name?: string | null;
  phone?: string;
  loyalty_points?: number;
}

interface CustomerIdentificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (customer: CustomerData | null) => void;
}

export function CustomerIdentificationModal({
  isOpen,
  onClose,
  onConfirm,
}: CustomerIdentificationModalProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [searchResults, setSearchResults] = useState<CustomerData[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setQuery("");
    setSearching(false);
    setCustomer(null);
    setSearchResults([]);
    setNotFound(false);
    setShowCreateForm(false);
    setNewName("");
    setNewPhone("");
    setCreating(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const searchCustomer = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    setSearching(true);
    setNotFound(false);
    setCustomer(null);
    setSearchResults([]);
    setShowCreateForm(false);

    try {
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        // API returns single object or { results: [...] }
        if (data.results) {
          setSearchResults(data.results);
        } else if (data.id) {
          setCustomer(data);
        }
      } else if (res.status === 404) {
        setNotFound(true);
      }
    } catch {
      console.error("Customer search error");
    } finally {
      setSearching(false);
    }
  };

  const selectCustomer = (c: CustomerData) => {
    setCustomer(c);
    setSearchResults([]);
  };

  const handleStartCreate = () => {
    const trimmed = query.trim();
    const digits = trimmed.replace(/\D/g, "");
    // Pre-fill: if query looks like a phone, put in phone field; otherwise in name
    if (digits.length >= 8) {
      setNewPhone(digits);
      setNewName("");
    } else {
      setNewName(trimmed);
      setNewPhone("");
    }
    setShowCreateForm(true);
  };

  const createCustomer = async () => {
    const phoneNormalized = newPhone.replace(/\D/g, "");
    if (phoneNormalized.length < 10) return;

    setCreating(true);
    try {
      const res = await fetch("/api/customers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim() || undefined,
          phone: phoneNormalized,
          whatsapp: phoneNormalized,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomer(data);
        setNotFound(false);
        setShowCreateForm(false);
        setSearchResults([]);
      }
    } catch {
      console.error("Customer create error");
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmCustomer = () => {
    onConfirm(customer);
    reset();
  };

  const handleSkip = () => {
    onConfirm(null);
    reset();
  };

  const formatPhone = (phone: string) => {
    const d = phone.replace(/\D/g, "");
    if (d.length >= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length >= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return phone;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="relative bg-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-md border border-slate-600 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 touch-target min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <X size={22} />
        </button>

        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <UserCheck size={22} className="text-brand-green" />
              Identificar Cliente
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Busque por nome ou telefone
            </p>
          </div>

          {/* Search Field */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setNotFound(false);
                  setCustomer(null);
                  setSearchResults([]);
                  setShowCreateForm(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchCustomer();
                }}
                placeholder="Nome ou telefone do cliente..."
                autoFocus
                className="flex-1 px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/50 text-lg"
              />
              <button
                type="button"
                onClick={searchCustomer}
                disabled={searching || query.trim().length < 2}
                className="touch-target min-w-[52px] min-h-[52px] flex items-center justify-center rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:cursor-not-allowed text-primary-dark transition-colors"
              >
                {searching ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <Search size={22} />
                )}
              </button>
            </div>
          </div>

          {/* Multiple Results List */}
          {searchResults.length > 0 && !customer && (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">
                {searchResults.length} cliente{searchResults.length > 1 ? "s" : ""} encontrado{searchResults.length > 1 ? "s" : ""}:
              </p>
              <div className="space-y-2 max-h-[240px] overflow-y-auto">
                {searchResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-brand-green/50 transition-colors text-left"
                  >
                    <div className="p-2 bg-slate-600 rounded-lg shrink-0">
                      <UserCheck size={18} className="text-brand-green" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">
                        {c.name || "Sem nome"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {c.phone ? formatPhone(c.phone) : "Sem telefone"}
                      </p>
                    </div>
                    {c.loyalty_points !== undefined && c.loyalty_points > 0 && (
                      <span className="text-xs text-brand-green font-medium shrink-0">
                        {c.loyalty_points} pts
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Single Customer Found */}
          {customer && (
            <div className="p-4 rounded-xl bg-brand-green/10 border border-brand-green/30 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-green/20 rounded-lg">
                  <UserCheck size={22} className="text-brand-green" />
                </div>
                <div>
                  <p className="text-white font-semibold">
                    {customer.name || "Cliente"}
                  </p>
                  <p className="text-sm text-slate-400">
                    {customer.phone ? formatPhone(customer.phone) : ""}
                  </p>
                </div>
              </div>
              {customer.loyalty_points !== undefined && customer.loyalty_points > 0 && (
                <p className="text-sm text-brand-green">
                  Pontos de fidelidade: <strong>{customer.loyalty_points}</strong>
                </p>
              )}
              <button
                type="button"
                onClick={handleConfirmCustomer}
                className="w-full touch-target min-h-[52px] bg-brand-green hover:bg-brand-green-hover text-primary-dark font-bold text-lg rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle size={20} />
                Confirmar e Pagar
              </button>
            </div>
          )}

          {/* Not Found */}
          {notFound && !showCreateForm && (
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 space-y-3">
              <p className="text-sm text-yellow-400 font-medium">
                Cliente não encontrado
              </p>
              <p className="text-xs text-slate-400">
                Deseja cadastrar este cliente agora?
              </p>
              <button
                type="button"
                onClick={handleStartCreate}
                className="w-full touch-target min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold transition-colors"
              >
                <UserPlus size={18} />
                Cadastrar Cliente
              </button>
            </div>
          )}

          {/* Create Customer Form */}
          {showCreateForm && !customer && (
            <div className="p-4 rounded-xl bg-slate-700/80 border border-slate-600 space-y-4">
              <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                <UserPlus size={16} className="text-brand-green" />
                Novo Cliente
              </p>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nome do Cliente</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do cliente"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-600 border border-slate-500 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Telefone / WhatsApp</label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createCustomer();
                  }}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-600 border border-slate-500 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/50"
                />
                {newPhone.replace(/\D/g, "").length > 0 && newPhone.replace(/\D/g, "").length < 10 && (
                  <p className="text-xs text-red-400 mt-1">Telefone deve ter pelo menos 10 digitos</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={createCustomer}
                  disabled={creating || newPhone.replace(/\D/g, "").length < 10}
                  className="flex-1 touch-target min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:cursor-not-allowed text-primary-dark font-semibold text-sm transition-colors"
                >
                  {creating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Salvar e Continuar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewName("");
                    setNewPhone("");
                  }}
                  className="px-4 min-h-[48px] rounded-xl bg-slate-600 hover:bg-slate-500 text-slate-300 text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Skip Button */}
          {!customer && (
            <button
              type="button"
              onClick={handleSkip}
              className="w-full touch-target min-h-[48px] flex items-center justify-center gap-2 rounded-xl border-2 border-slate-600 text-slate-300 hover:border-slate-500 hover:text-slate-200 font-semibold transition-colors"
            >
              <SkipForward size={18} />
              Pular - Venda sem cliente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
