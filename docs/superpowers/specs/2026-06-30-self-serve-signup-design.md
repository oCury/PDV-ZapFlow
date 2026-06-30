# Self-Serve Trial Signup (Visitor → Customer) — Design

**Date:** 2026-06-30
**Status:** Approved (Andre, 2026-06-30). Ready for implementation plan.
**Repo:** PDV-ZapFlow (signup lives in the app) + zapflow-landing (CTA wiring)
**Depends on:** tenancy foundation + entitlements (live) + cookie-first tenant resolver (`resolve-tenant.ts`, live).
**Relates to:** C1 Billing & Subscriptions (`2026-06-27-commercialization-layer-scope.md`) — payment/auto-charge is C1, NOT this.

---

## 1. Purpose & Scope

The landing already sells a self-serve **7-day, no-card** trial ("Começar agora" /
"Teste grátis por 7 dias"), but the app has no signup — those CTAs dead-end at a
login page. This builds the missing funnel: a visitor self-registers, **verifies
their email**, and lands in a fully-working trial account.

### In scope
- `/signup` page + `POST /api/auth/signup` (verify-first; no tenant created until verified).
- **Required email verification** via **Resend**, magic-link style.
- `PendingSignup` model + `/verify` page + `POST /api/auth/verify` + `POST /api/auth/resend-verification`.
- `Tenant.trial_ends_at` + a **trial gate** → `/assinar` paywall at expiry + countdown banner.
- Landing CTA wiring → `${APP_URL}/signup?plan=basic|pro`.
- Reuse: extract tenant+admin creation into a shared service used by both the CLI and signup.

### Out of scope (→ C1 Billing)
- Payment collection, card capture, auto-charge at trial end, automatic trial→paid conversion.
- Self-serve Enterprise (stays sales-led via WhatsApp).
- Per-action read-only degradation (we hard-block at expiry).

---

## 2. Flow (verify-first)

1. Landing CTA → `${APP_URL}/signup?plan=pro` (or `basic`).
2. `/signup` form: **loja name, your name, email, password, plan** (plan prefilled from `?plan=`, still changeable). A hidden **honeypot** field.
3. `POST /api/auth/signup`:
   - Validate: email not already a `User` and not in an active `PendingSignup`; password ≥ 8 chars; honeypot empty; plan ∈ {basic, pro}; rate-limit by IP.
   - Hash the password (existing `hashPassword`).
   - Create a `PendingSignup` row `{ token, email, name, loja, password_hash, plan, expires_at = now+24h }`. **No Tenant/User yet.**
   - `sendVerificationEmail(email, name, link)` where `link = ${APP_URL}/verify?token=<token>`.
   - Respond 200 "Confirme seu e-mail."
4. `/verify?token=…` (page) → on load, `POST /api/auth/verify { token }`:
   - Look up `PendingSignup` by token; reject if missing/expired.
   - Re-check email still unused (race safety).
   - In a **transaction**: create `Tenant` (plan, `trial_ends_at = now+7d`, slug auto-generated) + admin `User` (ADMIN, the stored `password_hash`, email) → delete the `PendingSignup`.
   - Set the session cookie (existing `setSessionCookie`/`createSessionToken`) → redirect to `/` (app).
   - **Trial clock starts at verification.**
5. `POST /api/auth/resend-verification { email }`: if an active pending row exists, regenerate token + resend. Rate-limited. (Always responds 200 to avoid email enumeration.)

---

## 3. Data Model

```prisma
model PendingSignup {
  id            String   @id @default(cuid())
  token         String   @unique
  email         String   @unique          // one pending signup per email
  name          String
  loja          String
  password_hash String
  plan          Plan
  expires_at    DateTime
  created_at    DateTime @default(now())

  @@map("pending_signups")
}

model Tenant {
  // ...existing...
  trial_ends_at DateTime?   // future = trialing, past = expired (blocked), null = no trial limit
}
```

- **`Tenant.trial_ends_at` null semantics:** existing/CLI-provisioned tenants
  (e.g. `loja-principal`) have `null` → **never gated by the trial** (grandfathered/active).
  Only self-serve signups get a `trial_ends_at`. When C1 lands, a paid/active flag
  will override this.
- `PendingSignup.email @unique` enforces one in-flight signup per email; resend reuses the row.
- Migration via `prisma db push` (session pooler) — additive (new table + nullable column), safe.

---

## 4. Email Verification Method (Resend, magic link)

- **Provider:** Resend. Env: `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `no-reply@<domain>`),
  `APP_URL`. Sending domain must be verified in Resend for production (test sends to
  own inbox work without it).
- **Token:** `randomBytes(32).toString("hex")`, stored on `PendingSignup.token`,
  single-use (deleted on verify), 24h expiry. Not a JWT — DB-backed so resend/expiry/
  revocation are trivial and no password ever rides in a URL.
- **Service:** `src/lib/email/resend.ts` → `sendVerificationEmail({ to, name, link })`.
  Throws on send failure (signup surfaces "não foi possível enviar o e-mail, tente
  novamente"). A simple branded HTML template (PT-BR): greeting, "Confirmar e-mail"
  button → `link`, 24h note, fallback URL.
- **Failure handling:** if Resend send fails, the `PendingSignup` row is rolled
  back/deleted so the user can retry cleanly.

---

## 5. Trial Gate

- A server check in the dashboard layout (same pattern as the entitlements page
  guards): resolve the tenant via the **cookie-first resolver** → read `trial_ends_at`.
- If `trial_ends_at != null && trial_ends_at < now` → `redirect("/assinar")` for every
  app route except `/assinar` and logout.
- `/assinar` page: "Seu teste terminou — assine para continuar." Data is preserved
  (nothing deleted). **WhatsApp CTA** (`+55 13 99716-4200`) = manual conversion until
  C1 automates it.
- **Countdown banner:** when `trial_ends_at` is within ~3 days, the app shell shows
  "Seu teste termina em N dias" with a subscribe link. Helper `trialStatus(tenant)` →
  `{ state: "active" | "trialing" | "expired", daysLeft }`.

---

## 6. Landing Wiring (zapflow-landing)

- Point CTAs at the app signup: `${APP_URL}/signup?plan=basic` and `?plan=pro` for the
  two plan cards; the generic hero/nav "Começar agora" → `${APP_URL}/signup` (plan
  picker defaults to Pro). Enterprise/`#planos` → WhatsApp (unchanged).
- `APP_URL` already exists as a constant in the landing's `page.tsx`.
- ⚠️ **Operational:** the landing working tree has an **uncommitted redesign** (real
  plans in `src/lib/plans.ts`, lucide-react, restyled globals/layout). Deploying the
  CTA change ships that too. Resolve first: either finish+commit the redesign, or apply
  only the CTA wiring on a clean checkout. Decide at implementation time.

---

## 7. Security & Abuse

- **Email verification** is the primary anti-abuse control (no tenant until verified).
- Honeypot field on the signup form (bots fill it → silently reject).
- Rate-limit `signup` and `resend-verification` by IP (in-memory token bucket or a
  small DB/Upstash counter — in-memory acceptable for MVP single-region).
- Password ≥ 8 chars; reuse `hashPassword` (scrypt).
- Slug sanitized (lowercase, `[a-z0-9-]`, collision suffix); never user-controlled HTML.
- `resend-verification` and `signup` responses must not leak whether an email exists
  (generic success messaging) to avoid enumeration.
- Verify endpoint is single-use + expiring; re-check email uniqueness inside the
  transaction (race safety).

---

## 8. Components / Files (anticipated)

| File | Change |
|---|---|
| `prisma/schema.prisma` | `PendingSignup` model; `Tenant.trial_ends_at` |
| `src/lib/tenant/provision.ts` | **new** — `createTenantWithAdmin({name,slug,email,passwordHash,plan,trialEndsAt})` (shared by CLI + verify) |
| `scripts/create-tenant.ts` | refactor to call the shared service |
| `src/lib/email/resend.ts` | **new** — `sendVerificationEmail` |
| `src/lib/auth.ts` | export helpers as needed (hashPassword already exported) |
| `src/lib/signup.ts` | **new** — slug generation, validation, `trialStatus()` helpers (pure, tested) |
| `src/app/api/auth/signup/route.ts` | **new** |
| `src/app/api/auth/verify/route.ts` | **new** |
| `src/app/api/auth/resend-verification/route.ts` | **new** |
| `src/app/signup/page.tsx` | **new** — form (client) |
| `src/app/verify/page.tsx` | **new** — consumes `?token`, calls verify |
| `src/app/assinar/page.tsx` | **new** — trial-expired paywall |
| dashboard layout + app shell | trial gate redirect + countdown banner |
| `zapflow-landing/src/app/page.tsx` | CTA hrefs → `${APP_URL}/signup?plan=…` |
| tests | slug/trial/validation units; signup→verify→app e2e; expired→/assinar e2e |

---

## 9. Testing

- **Unit (vitest):** slug generation (sanitize + collision), `trialStatus()` (active/
  trialing/expired/daysLeft, null = active), signup payload validation, token expiry.
- **Integration:** signup creates a `PendingSignup` (no Tenant); verify creates Tenant+
  User and deletes the pending row; expired token rejected; duplicate email rejected.
- **E2E (Playwright):** happy path signup → (mock/stub email) verify link → lands in app;
  expired-trial tenant → redirected to `/assinar`. Email send mocked in tests.

---

## 10. Setup Dependencies (user)

- **Resend account** + verified sending domain; set `RESEND_API_KEY`, `EMAIL_FROM`,
  `APP_URL` in Vercel (prod) and `.env` (local).
- DB migration (`prisma db push`, session pooler) — additive, safe.
- Decide the landing-redesign deploy approach (§6).
