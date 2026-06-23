"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Loader2,
  Shield,
  ShieldCheck,
  Eye,
  EyeOff,
  X,
  KeyRound,
} from "lucide-react";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EMPLOYEE";
  active: boolean;
  created_at: string;
}

export default function StaffPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetModal, setResetModal] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "EMPLOYEE" as "ADMIN" | "EMPLOYEE",
  });

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/staff");
      if (res.ok) setUsers(await res.json());
    } catch {
      // intentionally ignored
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao criar usuário.");
        return;
      }

      setModalOpen(false);
      setForm({ name: "", email: "", password: "", role: "EMPLOYEE" });
      fetchUsers();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    fetchUsers();
  };

  const handleResetPassword = async () => {
    if (!resetModal || !newPassword.trim()) return;
    setSaving(true);
    await fetch(`/api/staff/${resetModal}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    setSaving(false);
    setResetModal(null);
    setNewPassword("");
  };

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition-all";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Equipe</h1>
          <p className="text-slate-400 text-sm mt-1">
            Gerencie os usuários do sistema
          </p>
        </div>
        <button
          onClick={() => {
            setModalOpen(true);
            setError(null);
          }}
          className="bg-brand-green hover:bg-brand-green-hover text-primary-dark font-semibold px-5 py-2.5 rounded-2xl transition-colors duration-200 text-sm flex items-center gap-2"
        >
          <Plus size={18} />
          Novo Membro
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando equipe...
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Users size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="font-medium">Nenhum membro cadastrado</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {users.map((u) => (
            <div
              key={u.id}
              className={`bg-slate-800 rounded-2xl p-5 border border-slate-700 flex items-center gap-4 ${
                !u.active ? "opacity-60" : ""
              }`}
            >
              <div
                className={`p-2.5 rounded-xl ${
                  u.role === "ADMIN"
                    ? "bg-brand-green/10"
                    : "bg-blue-500/20"
                }`}
              >
                {u.role === "ADMIN" ? (
                  <ShieldCheck size={22} className="text-brand-green" />
                ) : (
                  <Shield size={22} className="text-blue-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-100">{u.name}</p>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      u.role === "ADMIN"
                        ? "bg-brand-green/20 text-brand-green"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {u.role === "ADMIN" ? "Admin" : "Funcionário"}
                  </span>
                  {!u.active && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                      Inativo
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{u.email}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setResetModal(u.id);
                    setNewPassword("");
                  }}
                  title="Redefinir senha"
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <KeyRound size={16} />
                </button>
                <button
                  onClick={() => toggleActive(u.id, u.active)}
                  title={u.active ? "Desativar" : "Ativar"}
                  className={`p-2 rounded-xl transition-colors ${
                    u.active
                      ? "text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      : "text-slate-500 hover:text-brand-green hover:bg-brand-green/10"
                  }`}
                >
                  {u.active ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-100">
                Novo Membro
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-500 hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <div className="bg-red-500/20 text-red-400 text-sm font-medium px-4 py-3 rounded-xl border border-red-500/30">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Nome *
                </label>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  required
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                  required
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Senha *
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, password: e.target.value }))
                  }
                  required
                  minLength={4}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Cargo
                </label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      role: e.target.value as "ADMIN" | "EMPLOYEE",
                    }))
                  }
                  className={inputCls}
                >
                  <option value="EMPLOYEE">Funcionário</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 text-primary-dark font-bold py-3 rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Criar Membro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setResetModal(null)}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <h3 className="font-bold text-slate-100">Redefinir Senha</h3>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nova senha"
              minLength={4}
              className={inputCls}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setResetModal(null)}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-600 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetPassword}
                disabled={saving || newPassword.length < 4}
                className="flex-1 bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 text-primary-dark font-bold py-2.5 rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Redefinir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
