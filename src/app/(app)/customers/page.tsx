"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Search, Star, Phone, Mail, IdCard, Loader2, Plus, X, Pencil, Trash2 } from "lucide-react";

interface Customer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  cpf: string | null;
  loyalty_points: number;
  created_at: string;
}

function formatCPF(cpf: string) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    cpf: "",
    whatsapp: "",
  });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customers");
      if (res.ok) setCustomers(await res.json());
    } catch { // intentionally ignored
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.name?.toLowerCase().includes(q) ?? false) ||
      c.phone.includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.cpf?.includes(q) ?? false)
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/customers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao cadastrar cliente.");
        return;
      }
      setModalOpen(false);
      setForm({ name: "", phone: "", email: "", cpf: "", whatsapp: "" });
      fetchCustomers();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setForm({
      name: c.name ?? "",
      phone: c.phone,
      email: c.email ?? "",
      cpf: c.cpf ?? "",
      whatsapp: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${editingCustomer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao atualizar cliente.");
        return;
      }
      setModalOpen(false);
      setEditingCustomer(null);
      setForm({ name: "", phone: "", email: "", cpf: "", whatsapp: "" });
      fetchCustomers();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Customer) => {
    const label = c.name || formatPhone(c.phone);
    if (!confirm(`Tem certeza que deseja excluir o cliente "${label}"?`)) return;

    setDeleting(c.id);
    try {
      const res = await fetch(`/api/customers/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erro ao excluir cliente.");
        return;
      }
      fetchCustomers();
    } catch {
      alert("Erro de conexão.");
    } finally {
      setDeleting(null);
    }
  };

  const inputCls =
    "w-full px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Clientes</h1>
          <p className="text-slate-400 text-sm mt-1">CRM e programa de fidelidade</p>
        </div>
        <button
          onClick={() => { setEditingCustomer(null); setForm({ name: "", phone: "", email: "", cpf: "", whatsapp: "" }); setModalOpen(true); setError(null); }}
          className="bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold px-5 py-2.5 rounded-2xl transition-colors text-sm flex items-center gap-2"
        >
          <Plus size={18} />
          Novo Cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nome, telefone, CPF ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all"
        />
      </div>

      {/* Customer list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando clientes...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Users size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="font-medium">{search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => (
            <div key={c.id} className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center shrink-0">
                <span className="text-brand-green font-bold text-sm">
                  {(c.name ?? c.phone).charAt(0).toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-100">
                  {c.name ?? <span className="italic text-slate-500">Sem nome</span>}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Phone size={11} />
                    {formatPhone(c.phone)}
                  </span>
                  {c.email && (
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Mail size={11} />
                      {c.email}
                    </span>
                  )}
                  {c.cpf && (
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <IdCard size={11} />
                      {formatCPF(c.cpf)}
                    </span>
                  )}
                </div>
              </div>

              {/* Loyalty points badge */}
              <div className="shrink-0 flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-xl">
                  <Star size={13} />
                  <span className="font-bold text-sm">{c.loyalty_points}</span>
                </div>
                <span className="text-[10px] text-slate-600">pontos</span>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex flex-col gap-1.5">
                <button
                  onClick={() => openEdit(c)}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-blue-400 transition-colors"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  disabled={deleting === c.id}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-red-500/20 text-slate-400 hover:text-red-400 disabled:opacity-50 transition-colors"
                  title="Excluir"
                >
                  {deleting === c.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setModalOpen(false); setEditingCustomer(null); }} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-100">
                {editingCustomer ? "Editar Cliente" : "Novo Cliente"}
              </h2>
              <button onClick={() => { setModalOpen(false); setEditingCustomer(null); }} className="text-slate-500 hover:text-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={editingCustomer ? handleUpdate : handleCreate} className="space-y-3">
              {error && (
                <div className="bg-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl border border-red-500/30">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nome</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Telefone *</label>
                <input required value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">CPF</label>
                <input value={form.cpf} onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))} className={inputCls} placeholder="000.000.000-00" maxLength={14} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">E-mail</label>
                <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="email@exemplo.com" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setModalOpen(false); setEditingCustomer(null); }} className="flex-1 px-4 py-3 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 text-primary-dark font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingCustomer ? "Salvar" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
