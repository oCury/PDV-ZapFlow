# Landing as the PDV Front Door — Design

**Date:** 2026-07-01
**Status:** Approved (Andre, 2026-07-01)
**Repo:** PDV-ZapFlow
**Related:** builds on the pay-upfront signup feature (`feat/pay-upfront-signup`); ports the marketing landing from the standalone `zapflow-landing` project into the PDV app.

---

## 1. Purpose

Today, opening the PDV web app at `/` forces a login (middleware redirects unauthenticated visitors to `/login`). We want the app's front door to be the **marketing landing page** with a clear **"Entrar" (Login)** button, and the self-serve **`/cadastro`** signup form — all served by the PDV app itself (same origin), so the funnel is: visit `/` → landing → Entrar (`/login`) or Cadastrar (`/cadastro` → pay-upfront checkout).

## 2. Scope

**In scope**
- Port the landing (`zapflow-landing/src/app/page.tsx` + `src/lib/plans.ts`) and the `/cadastro` form into the PDV app.
- Restructure PDV routing with Next.js **route groups**: `(marketing)` (public, light theme, no shell) and `(app)` (authenticated, dark theme, AppShell).
- Move the current dashboard from `/` to `/dashboard`.
- Add a **"Entrar"** button to the landing nav → `/login`; plan/hero CTAs → `/cadastro?plan=`.
- Same-origin `/cadastro` (drop the hardcoded `APP_URL`; POST relative `/api/signup/checkout`).
- Replace the **"7 dias grátis" trial copy** with pay-upfront messaging.
- Update middleware `PUBLIC_PATHS`, the post-login redirect, and app "home" links.

**Out of scope**
- Deleting/retiring the standalone `zapflow-landing` project (left as-is; the PDV-hosted landing becomes canonical).
- Any change to the pay-upfront backend (checkout/webhook/status/renewal) — already built.
- New marketing content/sections beyond what the landing already has.

## 3. Architecture — route groups

```
src/app/
  layout.tsx                 # ROOT: html/body, register fonts (Inter + Rubik + Nunito), global providers. No theme/shell.
  (marketing)/
    layout.tsx               # light theme + landing tokens; font-body default; NO AppShell
    page.tsx                 # landing (ported) — "/"
    cadastro/page.tsx        # signup form (ported, same-origin) — "/cadastro"
  (app)/
    layout.tsx               # AppShell + dark theme (moved out of root layout)
    dashboard/page.tsx       # current src/app/page.tsx moved here — "/dashboard"
    pdv/ products/ sales/ settings/ customers/ ... # all existing authenticated routes moved under (app)/ (URLs unchanged)
```

- Route groups do **not** change URLs — folder names in `()` are stripped from the path. Moving authenticated routes under `(app)/` keeps every existing URL identical.
- The **root layout** slims to html/body + `next/font` registration (Inter for the app, Rubik + Nunito for the landing) + any global providers currently in it. Theme (dark vs light) and the AppShell move into the two group layouts so the two design systems don't collide (PDV dark/Inter vs landing light/Rubik+Nunito).
- The landing's light theme tokens (`--color-brand: #16b364`, `--color-ink`, `--color-bg`, `--radius-card`, etc.) are scoped to the `(marketing)` layout; the app's dark tokens stay in the `(app)` layout. `globals.css` keeps only truly global resets; theme-specific `body`/token blocks move into the respective group layouts (via a scoped class or per-group CSS).

## 4. Auth & routing changes

- **Middleware** (`src/middleware.ts`): add `/` and `/cadastro` to `PUBLIC_PATHS`. All `(app)` routes remain gated (route-group names are invisible to the URL matcher, so existing matcher logic is unaffected). `/login`, `/assinar`, `/signup/sucesso`, and the pay-upfront API routes stay public as today.
- **Post-login redirect** (`src/app/login/page.tsx`): ADMIN `"/"` → **`"/dashboard"`**; EMPLOYEE `"/pdv"` unchanged.
- **App "home" links**: AppShell logo/home and any hardcoded `href="/"` that mean "dashboard" → `/dashboard`. (Leave links that legitimately mean the public site.)
- **AppShell bypass**: the current `pathname === "/login"` shell-skip is no longer needed for marketing pages (they live under `(marketing)` with no shell), but keep the `/login` behavior intact.

## 5. Landing integration details

- **Entrar button:** add a visible "Entrar" link in the landing `Nav` (desktop + mobile) → `/login`, distinct from the "Começar agora"/plan CTAs (→ `/cadastro?plan=`).
- **CTAs:** Basic/Pro plan cards → `/cadastro?plan=basic|pro`; hero + final CTA → `/cadastro?plan=basic` (as already wired in the ported page).
- **/cadastro:** remove `const APP_URL = "https://pdv-zap-flow.vercel.app"`; POST to relative `/api/signup/checkout` (same origin — CORS no longer needed for this call, but the endpoint's CORS support is harmless).
- **Copy fix:** replace "7 dias grátis"/free-trial wording across the landing (`Hero`, `Pricing` intro, `Faq`, `FinalCta`) and `plans.ts` `ctaNote`, and any trust-signal text on `/cadastro`, with pay-upfront messaging (e.g. "Ative na hora", "Sem fidelidade", "Cancele quando quiser", "Cobrança mensal").
- **Fonts:** load `Rubik` + `Nunito_Sans` via `next/font` in the root layout (exposed as `--font-rubik`/`--font-nunito`), consumed by the marketing layout's `--font-display`/`--font-body`. App keeps Inter.
- **Icons/deps:** the landing uses `lucide-react`; confirm it's a PDV dependency (it is used widely in the app) — reuse, no new dep.

## 6. Testing & verification

This is primarily UI + routing, so verification is behavior/route-based rather than heavy unit tests:
- `npm run build` green; `npx tsc --noEmit` clean.
- Route smoke checks: unauthenticated `GET /` → 200 landing (not redirected to /login); unauthenticated `GET /dashboard` → redirect to `/login`; `GET /cadastro` → 200; authenticated ADMIN login → lands on `/dashboard`; existing authenticated routes (e.g. `/pdv`, `/products`) still resolve at the same URLs.
- Manual/visual: landing renders with its light theme + fonts and does NOT show the app sidebar; the app routes render with the dark AppShell as before.

## 7. Risks & mitigations

- **Route-group folder moves (~20 dirs):** mechanical but must not miss one; imports use the `@/` alias (absolute) so moves don't break imports. Verify with `tsc` + build after the move.
- **Theme bleed:** the two `body`/token blocks must be scoped per group, or the last-loaded wins. Mitigate by moving theme into group layouts and scoping tokens.
- **Missed `/`→dashboard link:** grep for `href="/"` and `push("/")`/`replace("/")` to catch home links + the signup-success redirect (`/signup/sucesso` currently `router.replace("/")` → should go to `/dashboard` for a freshly provisioned ADMIN).
