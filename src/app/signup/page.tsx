"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function SignupForm() {
  const params = useSearchParams();
  const initialPlan = params.get("plan") === "basic" ? "basic" : "pro";
  const [plan, setPlan] = useState(initialPlan);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const f = new FormData(e.currentTarget);
    const body = { loja: f.get("loja"), name: f.get("name"), email: f.get("email"), password: f.get("password"), plan, website: f.get("website") };
    const r = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (r.ok) { setSent(true); return; }
    const d = await r.json().catch(() => ({}));
    setErr(d.error ?? "Não foi possível cadastrar.");
  }

  if (sent) return (
    <div className="text-center">
      <h1 className="text-2xl font-bold">Confirme seu e-mail</h1>
      <p className="mt-2 text-slate-600">Enviamos um link de confirmação. Clique nele para ativar seu teste grátis de 7 dias.</p>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3">
      <h1 className="text-2xl font-bold">Criar conta · plano {plan === "pro" ? "Pro" : "Basic"}</h1>
      <input name="loja" required placeholder="Nome da loja" className="w-full rounded-lg border px-3 py-2" />
      <input name="name" required placeholder="Seu nome" className="w-full rounded-lg border px-3 py-2" />
      <input name="email" type="email" required placeholder="E-mail" className="w-full rounded-lg border px-3 py-2" />
      <input name="password" type="password" required minLength={8} placeholder="Senha (mín. 8)" className="w-full rounded-lg border px-3 py-2" />
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => setPlan("basic")} className={`flex-1 rounded-lg border py-2 ${plan==="basic"?"border-brand-green font-semibold":""}`}>Basic</button>
        <button type="button" onClick={() => setPlan("pro")} className={`flex-1 rounded-lg border py-2 ${plan==="pro"?"border-brand-green font-semibold":""}`}>Pro</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button disabled={loading} className="w-full rounded-lg bg-brand-green py-3 font-semibold text-white disabled:opacity-60">{loading ? "Enviando..." : "Começar teste grátis"}</button>
      <p className="text-center text-xs text-slate-500">7 dias grátis. Já tem conta? <a href="/login" className="underline">Entrar</a></p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <Suspense><SignupForm /></Suspense>
    </main>
  );
}
