# Landing as the PDV Front Door — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PDV app's public root `/` the marketing landing page (with an "Entrar" login button) + a same-origin `/cadastro`, while the authenticated dashboard moves to `/dashboard`, all via Next.js route groups.

**Architecture:** Two route groups — `(marketing)` (public, light theme, Rubik/Nunito, no AppShell) serves `/` and `/cadastro`; `(app)` (authenticated, dark theme, Inter, AppShell) holds the dashboard (`/dashboard`) and every existing authenticated route (URLs unchanged). The root layout slims to html/body + font registration + global providers.

**Tech Stack:** Next.js 15 (App Router, route groups), Tailwind v4 (CSS-first `@theme`), TypeScript, lucide-react, next/font.

**Spec:** `docs/superpowers/specs/2026-07-01-landing-as-frontdoor-design.md`
**Branch:** `feat/pay-upfront-signup` (continue on it — the `/cadastro` port depends on `/api/signup/checkout` which only exists here).
**Run:** `npx tsc --noEmit`, `npm run build`.
**Source to port from:** `/Users/andrecury/Projetos/PDV/zapflow-landing/src/app/page.tsx` (landing, ~600 lines, self-contained), `/Users/andrecury/Projetos/PDV/zapflow-landing/src/lib/plans.ts`, `/Users/andrecury/Projetos/PDV/zapflow-landing/src/app/cadastro/page.tsx`, and its `src/app/globals.css` (`@theme` light tokens) + `src/app/layout.tsx` (Rubik/Nunito setup).

**Reused (read first):** PDV `src/app/layout.tsx` (root; separate global-vs-shell concerns), `src/components/app-shell.tsx`, `src/middleware.ts` (`PUBLIC_PATHS`), `src/app/login/page.tsx` (post-login redirect line ~34), `src/app/globals.css` (PDV `@theme` dark tokens), `src/app/api/signup/checkout/route.ts` (already CORS-enabled — harmless same-origin).

---

## File Structure

**Created:**
- `src/app/(marketing)/layout.tsx` — light-theme wrapper (sets light bg/text + `--font-body`), NO AppShell.
- `src/app/(marketing)/page.tsx` — ported landing.
- `src/app/(marketing)/cadastro/page.tsx` — ported signup form (same-origin).
- `src/app/(app)/layout.tsx` — AppShell + dark theme (moved out of root layout).
- `src/lib/plans.ts` — ported marketing plan display data.

**Moved (git mv — URLs unchanged; route-group names are stripped from the path):**
- `src/app/page.tsx` → `src/app/(app)/dashboard/page.tsx` (the dashboard, now `/dashboard`).
- Each existing PAGE route folder → under `src/app/(app)/`: `assinar, cashback, categories, commissions, customers, entregas, exchanges, fiscal, followups, labels, login, pdv, products, reports, sales, settings, signup, staff, tables, upgrade, vouchers`.
- **`src/app/api/` does NOT move** (API routes need no layout; leave at `src/app/api/`). `globals.css`, `favicon`, and static assets stay at `src/app/` root.

**Modified:**
- `src/app/layout.tsx` — slim to html/body + fonts (Inter + Rubik + Nunito) + global providers; remove AppShell + dark-theme-specific markup (moved to `(app)/layout.tsx`).
- `src/app/globals.css` — add landing light tokens to `@theme` (distinct names, no collision).
- `src/middleware.ts` — `PUBLIC_PATHS` += `/`, `/cadastro`.
- `src/app/login/page.tsx` — ADMIN post-login redirect `/` → `/dashboard`.
- `src/components/app-shell.tsx` — any `href="/"` home/logo link → `/dashboard` (keep the `pathname === "/login"` bypass).

---

## Task 1: Fonts + landing design tokens (additive, no structural change)

**Files:** Modify `src/app/layout.tsx`, `src/app/globals.css`.

- [ ] **Step 1:** In `src/app/layout.tsx`, add `Rubik` and `Nunito_Sans` from `next/font/google` alongside the existing `Inter`, each with a CSS variable (`--font-rubik`, `--font-nunito`) and appropriate subsets/weights (mirror the setup in `zapflow-landing/src/app/layout.tsx`). Apply all three font variables to the `<html>` or `<body>` className so they're available app-wide.
- [ ] **Step 2:** In `src/app/globals.css`, INSIDE the existing `@theme { ... }` block, add the landing's light tokens (copy the values from `zapflow-landing/src/app/globals.css`), keeping their landing names so the landing's utility classes resolve: `--color-brand`, `--color-brand-strong`, `--color-brand-soft`, `--color-brand-deep`, `--color-ink`, `--color-body`, `--color-faint`, `--color-bg`, `--color-bg-soft`, `--color-line`, `--radius-card`, and `--font-display: var(--font-rubik)`, `--font-body: var(--font-nunito)`. Do NOT modify existing PDV tokens (`--color-slate-*`, `--color-brand-green`, etc.) and do NOT change the global `body { }` dark background rule.
- [ ] **Step 3:** `cd /Users/andrecury/Projetos/PDV/PDV-ZapFlow && npx tsc --noEmit` → 0 errors; `npm run build` → green (env-placeholder retry if it only fails on missing env). No visual change expected yet.
- [ ] **Step 4:** `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add src/app/layout.tsx src/app/globals.css && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(landing): register Rubik/Nunito fonts + landing design tokens"`

---

## Task 2: Route-group restructure + landing at `/` (atomic front-door switch)

**Files:** Create `src/app/(app)/layout.tsx`, `src/app/(marketing)/layout.tsx`, `src/app/(marketing)/page.tsx`, `src/lib/plans.ts`; move ~20 route folders + the dashboard; Modify `src/middleware.ts`, `src/app/login/page.tsx`, `src/components/app-shell.tsx`. This task is atomic: it must leave the app fully buildable with the landing at `/` and the dashboard at `/dashboard`.

- [ ] **Step 1: Read** the current `src/app/layout.tsx` and identify which parts are (a) truly global (html/body, fonts, `<head>`/metadata, PWA registration, context providers that both marketing and app need) vs (b) app-shell-specific (the `<AppShell>` wrapper, dark-theme container).
- [ ] **Step 2: Create `src/app/(app)/layout.tsx`** — a layout that renders the app-shell-specific parts (the `<AppShell>` wrapper + dark theme container) around `{children}`. Move that markup out of the root layout. It should NOT re-declare `<html>`/`<body>` (only the root layout does that). Keep the AppShell's existing `pathname === "/login"` bypass behavior working (the check lives in `app-shell.tsx`, unchanged).
- [ ] **Step 3: Slim `src/app/layout.tsx`** — keep only `<html>`/`<body>`, the three font variables, metadata, PWA registration, and any global providers. Remove the `<AppShell>` (now in the app group layout).
- [ ] **Step 4: git mv the page routes under `(app)/`.** Run each move (folders that exist):
```bash
cd /Users/andrecury/Projetos/PDV/PDV-ZapFlow
mkdir -p "src/app/(app)/dashboard"
git mv src/app/page.tsx "src/app/(app)/dashboard/page.tsx"
for d in assinar cashback categories commissions customers entregas exchanges fiscal followups labels login pdv products reports sales settings signup staff tables upgrade vouchers; do
  [ -e "src/app/$d" ] && git mv "src/app/$d" "src/app/(app)/$d";
done
```
(If any listed folder does not exist, skip it; if a NON-listed page folder exists — anything under `src/app/` that is a page route, not `api`, not `globals.css`/layout/favicon — move it under `(app)/` too and report it.) **Do NOT move `src/app/api`.**
- [ ] **Step 5: Fix the dashboard "home" self-links** — the moved dashboard page and any component that assumed it lived at `/` still work by URL, but update the post-login redirect and app home link:
  - `src/app/(app)/login/page.tsx` (~line 34): `router.push(data.user.role === "ADMIN" ? "/" : "/pdv")` → `"/dashboard"` for ADMIN (EMPLOYEE stays `/pdv`).
  - `src/components/app-shell.tsx`: change the logo/home `href="/"` (the one meaning "dashboard") to `href="/dashboard"`. Grep the app for other `href="/"`/`router.push("/")`/`router.replace("/")` that mean "go to dashboard" and update them to `/dashboard`. **Exception:** `src/app/(app)/signup/sucesso/page.tsx` does `router.replace("/")` after a NEW signup — change it to `router.replace("/dashboard")` (a freshly provisioned ADMIN should land on the dashboard).
- [ ] **Step 6: Port `src/lib/plans.ts`** — copy `zapflow-landing/src/lib/plans.ts` to `src/lib/plans.ts` verbatim for now (copy fixes happen in Task 4). Confirm PDV resolves `@/lib/plans` to this file.
- [ ] **Step 7: Create `src/app/(marketing)/layout.tsx`** — a layout that wraps `{children}` in a light-theme container: a root element with `className` applying `bg-bg`/`text-body` (or inline `style` setting `background: var(--color-bg); color: var(--color-body)`), `min-height: 100dvh`, and `font-family: var(--font-body)`. This overrides the global dark `body` locally so marketing pages render light. It must NOT render `<html>`/`<body>` and must NOT import AppShell.
- [ ] **Step 8: Create `src/app/(marketing)/page.tsx`** — port `zapflow-landing/src/app/page.tsx`. Keep all sections (Nav, Hero, HeroVisual, Stats, Features, HowItWorks, Pricing, Faq, FinalCta, Footer). Adjust imports to PDV's `@/lib/plans`. Ensure `lucide-react` icons resolve (already a PDV dep). In `Nav` (desktop + mobile), ADD a visible **"Entrar"** link → `/login` (Next `<Link>`), styled as a secondary button distinct from the primary "Começar agora" CTA. Leave the CTA `href`s pointing at `/cadastro?plan=...` (already wired in the source). (Copy fixes are Task 4.)
- [ ] **Step 8b: Create the `/cadastro` route so nav/CTA links don't 404** — create `src/app/(marketing)/cadastro/page.tsx` now (the full port is Task 3; a minimal `"use client"` stub that renders a heading is fine here if you prefer, but doing the full Task-3 port here is also acceptable since it's the same session).
- [ ] **Step 9: Middleware** — in `src/middleware.ts`, add `"/"` and `"/cadastro"` to `PUBLIC_PATHS`. Confirm the matcher still excludes `_next`/static. All `(app)` routes keep their gating (group names are invisible to the matcher).
- [ ] **Step 10: Verify** — `npx tsc --noEmit` → 0 errors. `npm run build` → green. Route smoke (dev or built): unauth `GET /` → 200 (landing HTML, no redirect); unauth `GET /dashboard` → 302 `/login`; `GET /pdv` still resolves; ADMIN login → `/dashboard`.
- [ ] **Step 11: Commit**
```bash
git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add -A && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(landing): route groups — landing at /, dashboard at /dashboard, app shell in (app)"
```

---

## Task 3: Port `/cadastro` (same-origin)

**Files:** Create/replace `src/app/(marketing)/cadastro/page.tsx`.

- [ ] **Step 1:** Port `zapflow-landing/src/app/cadastro/page.tsx` to `src/app/(marketing)/cadastro/page.tsx`. Keep the client form, `<Suspense>` around `useSearchParams`, honeypot `website`, plan prefill/validation, loading/error states, and lucide icons.
- [ ] **Step 2:** Make it same-origin — REMOVE `const APP_URL = "https://pdv-zap-flow.vercel.app"` and change the POST target to the relative `"/api/signup/checkout"`. Keep the JSON body `{ loja, name, email, password, plan, website }` and success handling (`window.location.href = data.checkout_url`).
- [ ] **Step 3:** `npx tsc --noEmit` → 0 errors; `npm run build` → green; `GET /cadastro?plan=pro` → 200.
- [ ] **Step 4:** `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add "src/app/(marketing)/cadastro" && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(landing): same-origin /cadastro form"`

---

## Task 4: Pay-upfront copy + price alignment

**Files:** Modify `src/lib/plans.ts`, `src/app/(marketing)/page.tsx`, `src/app/(marketing)/cadastro/page.tsx`.

- [ ] **Step 1: Prices** — ensure displayed plan prices match the real charge (`PLAN_PRICE_CENTS` in `src/lib/billing/prices.ts`): Basic **R$89/mês**, Pro **R$169/mês**. Update `src/lib/plans.ts` price fields accordingly if they differ.
- [ ] **Step 2: Copy** — replace every free-trial phrase with pay-upfront messaging. Grep first: `grep -rniE "gr[aá]tis|7 dias|teste|trial|sem cart[aã]o" "src/app/(marketing)" src/lib/plans.ts`. Replace:
  - `plans.ts` `ctaNote` (both plans) → e.g. `"Cobrança mensal · cancele quando quiser"`.
  - Hero primary CTA label (`"Teste grátis por 7 dias"`) → `"Começar agora"`.
  - FinalCta body (`"Teste grátis por 7 dias, sem cartão."`) → e.g. `"Ative na hora. Sem fidelidade — cancele quando quiser."`.
  - Pricing section intro (`"Comece grátis..."`) → e.g. `"Escolha seu plano e ative na hora."`.
  - FAQ trial item → rewrite to pay-upfront (monthly, no lock-in, cancel anytime).
  - `/cadastro` trust signals mentioning "grátis"/"sem cartão" → pay-upfront equivalents.
- [ ] **Step 3:** `grep -rniE "gr[aá]tis|7 dias|trial" "src/app/(marketing)" src/lib/plans.ts` → should return nothing (or only legitimately-unrelated matches you can justify). `npm run build` → green.
- [ ] **Step 4:** `git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow add -A && git -C /Users/andrecury/Projetos/PDV/PDV-ZapFlow commit -m "feat(landing): pay-upfront copy + real plan prices (R$89/R$169)"`

---

## Task 5: Final verification

- [ ] **Step 1:** `npm test` (existing suites still pass — the pay-upfront unit tests are unaffected by routing) + `npx tsc --noEmit` (0 errors) + `npm run build` (green).
- [ ] **Step 2: Route smoke checks** (built app or `npm run dev`): unauth `GET /` → 200 landing (light theme, NO app sidebar); unauth `GET /dashboard` → 302 `/login`; `GET /cadastro?plan=pro` → 200 (form, no sidebar); a representative authenticated route (`/pdv`, `/products`) resolves at the same URL as before and shows the dark AppShell; ADMIN login lands on `/dashboard`.
- [ ] **Step 3: Theme isolation** — confirm the landing renders light (Rubik/Nunito, white bg) and the app renders dark (Inter, AppShell) — no theme bleed in either direction.
- [ ] **Step 4 (deploy — only if the user asks):** `vercel deploy` (preview) or merge/`--prod` per the user's instruction. NOT part of this plan's default scope.
