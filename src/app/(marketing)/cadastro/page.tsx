"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Store,
  ArrowRight,
  AlertCircle,
  Loader2,
  Check,
} from "lucide-react";
import { PLANS } from "@/lib/plans";

const APP_URL = ""; // same-origin: POSTs to this app's /api/signup/checkout

/* ─── Inner form (uses useSearchParams — must be inside <Suspense>) ─────────── */
function SignupForm() {
  const searchParams = useSearchParams();
  const rawPlan = searchParams.get("plan");
  const seededPlan: "basic" | "pro" =
    rawPlan === "basic" || rawPlan === "pro" ? rawPlan : "basic";

  const [plan, setPlan] = useState<"basic" | "pro">(seededPlan);
  const [loja, setLoja] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — must stay empty
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = PLANS.find((p) => p.id === plan) ?? PLANS[0];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Client-side validation (server is authoritative)
    if (!loja.trim()) {
      setError("Nome da loja é obrigatório.");
      return;
    }
    if (!name.trim()) {
      setError("Seu nome é obrigatório.");
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!email.trim() || !emailOk) {
      setError("E-mail inválido.");
      return;
    }
    if (password.length < 8) {
      setError("Senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${APP_URL}/api/signup/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ loja, name, email, password, plan, website }),
      });

      const data: { checkout_url?: string; error?: string } =
        await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Algo deu errado. Tente novamente.");
        return;
      }

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setError("Resposta inesperada do servidor. Tente novamente.");
      }
    } catch {
      setError(
        "Não foi possível conectar ao servidor. Verifique sua internet e tente de novo."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "mt-1.5 w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-colors";

  return (
    <div className="mx-auto w-full max-w-lg px-5">
      {/* Plan selector */}
      <div className="mb-7 grid grid-cols-2 gap-3">
        {PLANS.map((p) => {
          const active = plan === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p.id)}
              className={`relative rounded-2xl border p-4 text-left transition-all ${
                active
                  ? "border-brand bg-brand-soft ring-1 ring-brand/40"
                  : "border-line bg-bg hover:bg-bg-soft"
              }`}
            >
              {p.highlighted && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold text-white">
                  Popular
                </span>
              )}
              <p
                className={`font-display text-sm font-bold ${
                  active ? "text-brand-deep" : "text-ink"
                }`}
              >
                {p.name}
              </p>
              <p className="mt-0.5 text-xs text-faint">
                R$ {p.priceMonthly}/mês
              </p>
              {active && (
                <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-brand text-white">
                  <Check size={11} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Form card */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-card border border-line bg-bg p-7 shadow-[0_20px_60px_-30px_rgba(10,31,23,0.15)]"
      >
        <h2 className="font-display text-xl font-bold text-ink">
          Criar conta — {selectedPlan.name}
        </h2>
        <p className="mt-1 text-sm text-body">{selectedPlan.tagline}</p>

        <div className="mt-6 space-y-4">
          {/* Loja */}
          <div>
            <label
              htmlFor="loja"
              className="block text-sm font-semibold text-ink"
            >
              Nome da loja
            </label>
            <input
              id="loja"
              name="loja"
              type="text"
              autoComplete="organization"
              placeholder="Ex: Boutique da Maria"
              required
              value={loja}
              onChange={(e) => setLoja(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-ink"
            >
              Seu nome
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Nome completo"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-semibold text-ink"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@sualoja.com.br"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-semibold text-ink"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Honeypot — visually hidden, must NOT be filled by real users */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", opacity: 0 }}
          tabIndex={-1}
        >
          <label htmlFor="website">Website (não preencha este campo)</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {/* Inline error */}
        {error && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Aguarde…
            </>
          ) : (
            <>
              Ir para pagamento
              <ArrowRight size={18} />
            </>
          )}
        </button>

        <p className="mt-3 text-center text-xs text-faint">
          {selectedPlan.ctaNote} · Pagamento processado com segurança
        </p>
      </form>
    </div>
  );
}

/* ─── Skeleton shown while Suspense resolves ─────────────────────────────── */
function FormSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg animate-pulse px-5">
      <div className="mb-7 grid grid-cols-2 gap-3">
        <div className="h-20 rounded-2xl bg-bg-soft" />
        <div className="h-20 rounded-2xl bg-bg-soft" />
      </div>
      <div className="h-[420px] rounded-card bg-bg-soft" />
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function CadastroPage() {
  return (
    <div className="min-h-dvh bg-bg-soft">
      {/* Minimal nav */}
      <header className="sticky top-0 z-50 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <nav
          aria-label="Navegação"
          className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5"
        >
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-lg font-bold text-ink"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-brand text-white">
              <Store size={18} />
            </span>
            ZapFlow <span className="text-brand">PDV</span>
          </Link>
          <Link
            href="/#planos"
            className="text-sm font-semibold text-body transition-colors hover:text-ink"
          >
            Ver planos
          </Link>
        </nav>
      </header>

      <main className="pb-20 pt-12">
        {/* Page heading */}
        <div className="mx-auto mb-8 max-w-lg px-5 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-4 py-1.5 text-sm font-semibold text-brand-deep">
            <span className="size-2 rounded-full bg-brand" />
            Pagamento seguro via InfinitePay
          </span>
          <h1 className="mt-4 text-3xl font-bold text-ink sm:text-4xl">
            Crie sua conta e comece a vender
          </h1>
          <p className="mt-3 text-base leading-relaxed text-body">
            Escolha o plano, preencha seus dados e você será direcionado ao
            pagamento. Em minutos estará no ar.
          </p>
        </div>

        <Suspense fallback={<FormSkeleton />}>
          <SignupForm />
        </Suspense>

        {/* Trust signals */}
        <ul className="mx-auto mt-10 flex max-w-lg flex-wrap items-center justify-center gap-x-6 gap-y-2 px-5 text-sm text-faint">
          {[
            "Pagamento 100% seguro",
            "Dados criptografados",
            "Cancele quando quiser",
          ].map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <Check size={14} className="text-brand" />
              {item}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
