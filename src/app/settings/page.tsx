"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, Palette, Store, MessageCircle } from "lucide-react";

type ThemeOption = "light" | "dark" | "system";

const themeOptions: { value: ThemeOption; label: string; icon: typeof Moon }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Configurações</h1>
        <p className="text-slate-400 text-sm mt-1">
          Personalize o sistema conforme suas preferências
        </p>
      </div>

      {/* ── Appearance ─────────────────────────────────────────────── */}
      <section className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
          <div className="p-2 bg-brand-green/10 rounded-xl">
            <Palette size={18} className="text-brand-green" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-100 text-sm">Aparência</h2>
            <p className="text-slate-500 text-xs">Escolha o tema da interface</p>
          </div>
        </div>

        <div className="p-6">
          {mounted ? (
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ value, label, icon: Icon }) => {
                const active = theme === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all duration-200 ${
                      active
                        ? "border-brand-green bg-brand-green/10 text-brand-green"
                        : "border-slate-700 bg-slate-700/50 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }`}
                  >
                    <Icon size={22} />
                    <span className="text-sm font-medium">{label}</span>
                    {active && (
                      <span className="text-[10px] font-bold bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full">
                        Ativo
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ label }) => (
                <div
                  key={label}
                  className="h-[100px] rounded-xl border-2 border-slate-700 bg-slate-700/50 animate-pulse"
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Store Settings (placeholder) ───────────────────────────── */}
      <section className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden opacity-60">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
          <div className="p-2 bg-slate-700 rounded-xl">
            <Store size={18} className="text-slate-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-100 text-sm">Configurações da Loja</h2>
            <p className="text-slate-500 text-xs">Nome, CNPJ, endereço e dados fiscais</p>
          </div>
          <span className="text-[10px] font-bold bg-slate-700 text-slate-400 px-2.5 py-1 rounded-full">
            Em breve
          </span>
        </div>
        <div className="px-6 py-8 text-center text-slate-600 text-sm">
          Configurações da loja serão adicionadas em breve.
        </div>
      </section>

      {/* ── WhatsApp Settings (placeholder) ────────────────────────── */}
      <section className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden opacity-60">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
          <div className="p-2 bg-slate-700 rounded-xl">
            <MessageCircle size={18} className="text-slate-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-100 text-sm">Configurações do WhatsApp</h2>
            <p className="text-slate-500 text-xs">Notificações e mensagens automáticas via ZapFlow</p>
          </div>
          <span className="text-[10px] font-bold bg-slate-700 text-slate-400 px-2.5 py-1 rounded-full">
            Em breve
          </span>
        </div>
        <div className="px-6 py-8 text-center text-slate-600 text-sm">
          Integração com WhatsApp será configurada em breve.
        </div>
      </section>
    </div>
  );
}
