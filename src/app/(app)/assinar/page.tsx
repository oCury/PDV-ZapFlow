"use client";

import { useState } from "react";

const WHATSAPP_URL = "https://wa.me/5513997164200";

export default function AssinarPage() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function handleRenew() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/subscription/renew-checkout", { method: "POST" });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        alert(error ?? "Erro ao iniciar renovação. Tente novamente.");
        setLoading(false);
        return;
      }
      const { checkout_url } = (await res.json()) as { checkout_url: string };
      window.location.href = checkout_url;
    } catch {
      alert("Erro ao iniciar renovação. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold">Sua assinatura venceu — renove para continuar.</h1>
      <p className="text-slate-600">
        Seus dados estão salvos. Renove para continuar usando o PDV ZapFlow com tudo que você já
        configurou.
      </p>
      <button
        onClick={handleRenew}
        disabled={loading}
        className="rounded-lg bg-brand-green px-6 py-3 font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Aguarde…" : "Renovar assinatura"}
      </button>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-slate-500 underline"
      >
        Falar com a gente pelo WhatsApp
      </a>
      <button onClick={logout} className="text-sm text-slate-500 underline">
        Sair
      </button>
    </main>
  );
}
