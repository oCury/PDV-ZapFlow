"use client";

import { useState } from "react";
import {
  ShoppingBag,
  CreditCard,
  QrCode,
  MessageCircle,
  FileText,
  Gift,
  Repeat,
  Truck,
  BarChart3,
  Smartphone,
  Check,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
  Store,
} from "lucide-react";
import { PLANS } from "@/lib/plans";

const WHATSAPP_URL = "https://wa.me/5513997164200";
const APP_URL = "#planos";

/* ─── Nav ──────────────────────────────────────────────────────────────────── */
function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#recursos", label: "Recursos" },
    { href: "#como-funciona", label: "Como funciona" },
    { href: "#planos", label: "Planos" },
    { href: "#faq", label: "FAQ" },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5"
      >
        <a href="#topo" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <span className="grid size-8 place-items-center rounded-xl bg-brand text-white">
            <Store size={18} />
          </span>
          ZapFlow <span className="text-brand">PDV</span>
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm font-semibold text-body transition-colors hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <a href={WHATSAPP_URL} className="text-sm font-semibold text-body hover:text-ink">
            Falar com vendas
          </a>
          <a
            href="/login"
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-bg-soft"
          >
            Entrar
          </a>
          <a
            href="/cadastro?plan=basic"
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-strong"
          >
            Começar agora
          </a>
        </div>

        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-10 place-items-center rounded-lg text-ink md:hidden"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-line bg-bg px-5 py-4 md:hidden">
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base font-semibold text-body hover:bg-bg-soft hover:text-ink"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="mt-2">
              <a
                href="/login"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-line px-4 py-3 text-center text-base font-bold text-ink"
              >
                Entrar
              </a>
            </li>
            <li className="mt-2">
              <a
                href="/cadastro?plan=basic"
                onClick={() => setOpen(false)}
                className="block rounded-xl bg-brand px-4 py-3 text-center text-base font-bold text-white"
              >
                Começar agora
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

/* ─── Hero ─────────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--color-brand-soft),transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:pt-24">
        <span className="fade-up inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-4 py-1.5 text-sm font-semibold text-brand-deep">
          <span className="size-2 rounded-full bg-brand" /> Feito para lojas de moda no Brasil
        </span>

        <h1 className="fade-up mx-auto mt-6 max-w-3xl text-4xl font-bold text-ink sm:text-5xl md:text-6xl">
          O PDV completo para sua{" "}
          <span className="text-brand">loja de moda</span> vender mais
        </h1>

        <p className="fade-up mx-auto mt-5 max-w-xl text-lg leading-relaxed text-body">
          Catálogo com grade de tamanho e cor, maquininha Mercado Pago, PIX,
          NFC-e, fidelidade e follow-up no WhatsApp — tudo num só lugar, do
          balcão ao pós-venda.
        </p>

        <div className="fade-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/cadastro?plan=basic"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-brand-strong sm:w-auto"
          >
            Teste grátis por 7 dias
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="#planos"
            className="inline-flex w-full items-center justify-center rounded-xl border border-line bg-bg px-7 py-3.5 text-base font-bold text-ink transition-colors hover:bg-bg-soft sm:w-auto"
          >
            Ver planos
          </a>
        </div>

        <p className="mt-4 text-sm text-faint">
          Sem cartão · Sem instalação · Funciona no celular, tablet e PC
        </p>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="fade-up mx-auto mt-14 max-w-4xl">
      <div className="rounded-card border border-line bg-bg-soft p-3 shadow-[0_30px_80px_-40px_rgba(10,31,23,0.4)]">
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Cart */}
          <div className="rounded-2xl bg-bg p-5 text-left shadow-sm sm:col-span-2">
            <p className="text-xs font-bold uppercase tracking-wide text-faint">Venda · Caixa 1</p>
            <div className="mt-3 space-y-2.5">
              {[
                ["Vestido midi · M · Verde", "R$ 159,90"],
                ["Calça wide · 40 · Preto", "R$ 199,90"],
                ["Blusa cropped · P · Off", "R$ 89,90"],
              ].map(([name, price]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="text-body">{name}</span>
                  <span className="font-semibold text-ink tabular-nums">{price}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="font-display font-bold text-ink">Total</span>
              <span className="font-display text-xl font-bold text-brand tabular-nums">R$ 449,70</span>
            </div>
          </div>
          {/* Payment */}
          <div className="flex flex-col justify-between rounded-2xl bg-ink p-5 text-left text-white">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">Maquininha</p>
              <p className="mt-2 text-sm text-white/80">Crédito em até 6x</p>
              <p className="mt-1 font-display text-lg font-bold">6x de R$ 74,95</p>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-white">
              <CreditCard size={16} /> Aprovado
              <Check size={16} className="ml-auto" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stats ────────────────────────────────────────────────────────────────── */
function Stats() {
  const stats = [
    ["+1.200", "lojas usando"],
    ["R$ 80mi+", "em vendas processadas"],
    ["99,9%", "de disponibilidade"],
    ["4,9★", "avaliação dos lojistas"],
  ];
  return (
    <section className="border-y border-line bg-bg-soft">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 md:grid-cols-4">
        {stats.map(([value, label]) => (
          <div key={label} className="text-center">
            <p className="font-display text-3xl font-bold text-ink">{value}</p>
            <p className="mt-1 text-sm text-faint">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Features (bento) ─────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: CreditCard,
    title: "Maquininha Mercado Pago",
    desc: "Cobre crédito, débito e PIX direto na maquininha, com parcelamento — sem digitar valor duas vezes.",
    span: "sm:col-span-2",
    dark: true,
  },
  {
    icon: ShoppingBag,
    title: "Grade de tamanho e cor",
    desc: "Catálogo de moda de verdade: variações por SKU com estoque individual.",
  },
  {
    icon: MessageCircle,
    title: "Follow-up no WhatsApp",
    desc: "Mensagens automáticas de pós-venda e recompra que trazem o cliente de volta.",
    span: "sm:col-span-2",
  },
  {
    icon: QrCode,
    title: "PIX e cartão",
    desc: "Receba do jeito que o cliente preferir, com baixa de estoque automática.",
  },
  { icon: FileText, title: "NFC-e", desc: "Emita nota fiscal eletrônica direto da venda." },
  { icon: Gift, title: "Fidelidade & cashback", desc: "Pontos e cashback para girar a clientela." },
  { icon: Repeat, title: "Trocas & vale-presente", desc: "Trocas sem dor de cabeça e crédito na loja." },
  { icon: Truck, title: "Entregas", desc: "Motoboy, 99 e Correios a partir do balcão." },
  { icon: BarChart3, title: "Relatórios", desc: "Curva ABC, margem e giro pra decidir com dados." },
  { icon: Smartphone, title: "Funciona no celular", desc: "PWA: balcão, tablet ou celular, online ou na correria." },
];

function Features() {
  return (
    <section id="recursos" className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold text-ink sm:text-4xl">
          Tudo que sua loja precisa, sem gambiarra
        </h2>
        <p className="mt-4 text-lg text-body">
          Do cadastro do produto ao pós-venda — um sistema só, pensado para o
          varejo de moda.
        </p>
      </div>

      <div className="mt-12 grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          const dark = "dark" in f && f.dark;
          return (
            <article
              key={f.title}
              className={`${f.span ?? ""} group rounded-card border p-6 transition-shadow hover:shadow-[0_20px_50px_-30px_rgba(10,31,23,0.45)] ${
                dark ? "border-transparent bg-ink text-white" : "border-line bg-bg"
              }`}
            >
              <span
                className={`grid size-11 place-items-center rounded-xl ${
                  dark ? "bg-brand text-white" : "bg-brand-soft text-brand-deep"
                }`}
              >
                <Icon size={22} />
              </span>
              <h3 className={`mt-4 text-lg font-bold ${dark ? "text-white" : "text-ink"}`}>
                {f.title}
              </h3>
              <p className={`mt-1.5 text-sm leading-relaxed ${dark ? "text-white/75" : "text-body"}`}>
                {f.desc}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ─── How it works ─────────────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Cadastre seus produtos",
      desc: "Importe ou crie o catálogo com grade de tamanho e cor em minutos.",
    },
    {
      n: "02",
      title: "Venda no balcão",
      desc: "Bipou, cobrou na maquininha ou PIX, baixou estoque e emitiu a nota.",
    },
    {
      n: "03",
      title: "Fidelize e cresça",
      desc: "Cashback, WhatsApp automático e relatórios pra vender de novo.",
    },
  ];
  return (
    <section id="como-funciona" className="border-y border-line bg-bg-soft">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-ink sm:text-4xl">Comece a vender em 3 passos</h2>
          <p className="mt-4 text-lg text-body">Sem técnico, sem instalação, sem complicação.</p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-card border border-line bg-bg p-7">
              <span className="font-display text-4xl font-bold text-brand/30">{s.n}</span>
              <h3 className="mt-3 text-xl font-bold text-ink">{s.title}</h3>
              <p className="mt-2 text-body">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ──────────────────────────────────────────────────────────────── */
function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section id="planos" className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold text-ink sm:text-4xl">Planos que cabem no seu caixa</h2>
        <p className="mt-4 text-lg text-body">
          Sem fidelidade. Comece grátis e mude de plano quando quiser.
        </p>

        <div className="mt-7 inline-flex items-center gap-1 rounded-xl border border-line bg-bg-soft p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
              !annual ? "bg-bg text-ink shadow-sm" : "text-faint hover:text-ink"
            }`}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
              annual ? "bg-bg text-ink shadow-sm" : "text-faint hover:text-ink"
            }`}
          >
            Anual <span className="text-brand">-25%</span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
        {PLANS.map((plan) => {
          const price = annual ? plan.priceAnnual : plan.priceMonthly;
          return (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-card border p-7 ${
                plan.highlighted
                  ? "border-brand bg-bg shadow-[0_30px_70px_-40px_rgba(22,179,100,0.55)] ring-1 ring-brand/30"
                  : "border-line bg-bg"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">
                  Mais popular
                </span>
              )}
              <h3 className="font-display text-2xl font-bold text-ink">{plan.name}</h3>
              <p className="mt-1 text-sm text-body">{plan.tagline}</p>

              <div className="mt-5 flex items-end gap-1">
                <span className="font-display text-4xl font-bold text-ink tabular-nums">
                  R$ {price}
                </span>
                <span className="mb-1 text-sm text-faint">/mês</span>
              </div>
              {annual && <p className="mt-1 text-xs text-brand-deep">cobrado anualmente</p>}

              <a
                href={`/cadastro?plan=${plan.id}`}
                className={`mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-bold transition-colors ${
                  plan.highlighted
                    ? "bg-brand text-white hover:bg-brand-strong"
                    : "border border-line bg-bg text-ink hover:bg-bg-soft"
                }`}
              >
                {plan.ctaLabel}
                <ArrowRight size={18} />
              </a>
              <p className="mt-2 text-center text-xs text-faint">{plan.ctaNote}</p>

              <ul className="mt-6 space-y-3 border-t border-line pt-6">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-body">
                    <Check size={18} className="mt-0.5 shrink-0 text-brand" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      <p className="mx-auto mt-6 max-w-xl text-center text-sm text-faint">
        Precisa de algo sob medida (rede de lojas, franquias)?{" "}
        <a href={WHATSAPP_URL} className="font-semibold text-brand-deep underline-offset-2 hover:underline">
          Fale com a gente
        </a>
        .
      </p>
    </section>
  );
}

/* ─── FAQ ──────────────────────────────────────────────────────────────────── */
const FAQS = [
  {
    q: "Preciso instalar alguma coisa?",
    a: "Não. O ZapFlow PDV roda no navegador e também como app no celular (PWA). É só entrar e vender.",
  },
  {
    q: "Funciona no celular e no tablet?",
    a: "Sim. A interface é pensada para toque e funciona bem em celular, tablet e computador — ideal para o balcão e para vendas avulsas.",
  },
  {
    q: "A maquininha está inclusa?",
    a: "A integração com a maquininha Mercado Pago Point é nativa. O aparelho você adquire com o Mercado Pago; o sistema conversa com ele direto do PDV.",
  },
  {
    q: "Emite nota fiscal (NFC-e)?",
    a: "Sim, no plano Pro. A NFC-e é emitida direto da venda, com QR Code e DANFE.",
  },
  {
    q: "Consigo migrar meus produtos?",
    a: "Sim. Você pode importar seu catálogo e começar com tudo cadastrado, sem digitar item por item.",
  },
  {
    q: "Tem fidelidade ou multa de cancelamento?",
    a: "Não. Você começa com 7 dias grátis e cancela quando quiser, sem multa.",
  },
];

function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <section id="faq" className="border-t border-line bg-bg-soft">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:py-24">
        <h2 className="text-center text-3xl font-bold text-ink sm:text-4xl">Perguntas frequentes</h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((item, i) => {
            const open = openIdx === i;
            return (
              <div key={item.q} className="overflow-hidden rounded-2xl border border-line bg-bg">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-display font-bold text-ink">{item.q}</span>
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-brand transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                  />
                </button>
                {open && <p className="px-5 pb-5 text-body">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ────────────────────────────────────────────────────────────── */
function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="relative overflow-hidden rounded-card bg-dark px-6 py-16 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(22,179,100,0.35),transparent_70%)]"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold text-white sm:text-4xl">
            Pronto para vender mais e controlar tudo?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">
            Leva minutos para começar. Teste grátis por 7 dias, sem cartão.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/cadastro?plan=basic"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-strong sm:w-auto"
            >
              Começar agora <ArrowRight size={18} />
            </a>
            <a
              href={WHATSAPP_URL}
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 px-7 py-3.5 text-base font-bold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ───────────────────────────────────────────────────────────────── */
function Footer() {
  const cols = [
    { title: "Produto", links: ["Recursos", "Planos", "Maquininha", "NFC-e"] },
    { title: "Empresa", links: ["Sobre", "Blog", "Contato"] },
    { title: "Suporte", links: ["Central de ajuda", "WhatsApp", "Status"] },
  ];
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <a href="#topo" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <span className="grid size-8 place-items-center rounded-xl bg-brand text-white">
              <Store size={18} />
            </span>
            ZapFlow <span className="text-brand">PDV</span>
          </a>
          <p className="mt-3 max-w-xs text-sm text-faint">
            O sistema de PDV completo para o varejo de moda brasileiro.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink">{c.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l}>
                  <a href={WHATSAPP_URL} className="text-sm text-body transition-colors hover:text-brand-deep">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-6 text-sm text-faint">
          © {new Date().getFullYear()} ZapFlow PDV. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
