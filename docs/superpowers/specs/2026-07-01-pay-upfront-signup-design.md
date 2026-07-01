# Pay-Upfront Signup via InfinitePay (Model B) — Design

**Date:** 2026-07-01
**Status:** Approved (Andre, 2026-07-01). Ready for implementation plan.
**Repo:** PDV-ZapFlow (backend + success/renew pages) + zapflow-landing (cadastro form)
**Supersedes:** the deployed 7-day *trial* signup (`2026-06-30-self-serve-signup-design.md`) — this replaces the trial model with pay-upfront.
**Decisions locked (Andre):** cadastro + payment on the landing; **pay-upfront, no free trial**; **month-to-month** (one-time charge per cycle); **no email verification** (payment proves the customer).

---

## 1. Purpose & Scope

A visitor on the dedicated landing page fills a **cadastro form**, **pays via InfinitePay**, and — only after payment clears — gets an **active account** and is dropped into the app. Access stays active while paid; at cycle end it lapses to a renew paywall.

### In scope
- Landing cadastro form (loja, name, email, password, plan) → PDV checkout API (CORS).
- InfinitePay **Checkout** link creation + **webhook** activation (`src/lib/infinitepay/`).
- `PendingSignup` repurposed to a **pay-pending** keyed by `order_nsu`; `Tenant.paid_until`.
- Webhook creates the tenant+admin (active) via the existing provision service; **auto-login** on the success redirect.
- Middleware gate on `paid_until` → **`/assinar`** renew page (generates a fresh InfinitePay link).
- **Remove** the Resend email-verification flow.

### Out of scope
- **Auto-recurrence / card-on-file** (InfinitePay *recorrência* product — deferred until its API is confirmed with CloudWalk). MVP is month-to-month, customer actively pays each cycle.
- NFS-e / fiscal for the SaaS charge (later).
- Enterprise self-serve (stays sales-led / WhatsApp).
- Plan up/downgrade mid-cycle.

---

## 2. Flow

1. **Landing** cadastro form (dedicated page): loja, name, email, password, plan (basic|pro). Honeypot field.
2. Submit → `POST {APP_URL}/api/signup/checkout` (CORS-allowed for the landing origin):
   - Validate (reuse `validateSignup`); reject if email already a `User`.
   - Generate an unguessable `order_nsu` (`randomBytes(32).hex`).
   - Store a **pending signup** `{ order_nsu, email, name, loja, password_hash, plan, amount_cents, status:"pending", expires_at:+2h }`. **No account yet.**
   - Call InfinitePay `POST /links` (§4) with `order_nsu`, `amount`, `webhook_url`, `redirect_url` → get `checkout_url` (+ `invoice_slug`, stored on the pending row).
   - Return `{ checkout_url }`; landing redirects the browser there.
3. Customer pays on InfinitePay (Pix or credit).
4. **`POST /api/webhooks/infinitepay`** (provider-called, no session): verify (§4) → find pending by `order_nsu` → if not already completed, in a transaction: `createTenantWithAdmin` (plan, `paid_until = now + 1 month`, adminName = pending.name) → mark pending `status:"paid"`, stamp `created_tenant_id`+`created_user_id`. Idempotent (a retried webhook is a no-op). Respond 200 fast (<1s).
5. `redirect_url` = `{APP_URL}/signup/sucesso?order=<order_nsu>` → the success page:
   - Looks up the pending by `order_nsu`. If `status:"paid"`, **set the session cookie** for `created_user_id` (auto-login) and mark the pending `consumed`; redirect into the app (`/`).
   - If still `pending` (webhook slightly delayed), show "Confirmando pagamento…" and poll every ~2s for up to ~30s.
   - `order_nsu` is a 256-bit random single-use token → safe to use for this one-time auto-login.

---

## 3. Data Model

Repurpose `PendingSignup` (drop the email-verify token flow):

```prisma
model PendingSignup {
  id                String    @id @default(cuid())
  order_nsu         String    @unique          // our order id + success-page login token
  email             String                     // for the dup-account check (NOT unique — retries allowed)
  name              String
  loja              String
  password_hash     String
  plan              Plan
  amount_cents      Int
  invoice_slug      String?                    // InfinitePay reference
  status            String    @default("pending") // pending | paid | consumed
  created_tenant_id String?
  created_user_id   String?
  expires_at        DateTime
  created_at        DateTime  @default(now())

  @@map("pending_signups")
}

model Tenant {
  // ...
  paid_until  DateTime?   // active while in the future; null = grandfathered (loja-principal), never gated
}
```

- `email @unique` is **removed** (a customer whose first payment failed can retry → new pending row). Dup **accounts** are still prevented by the `User.email` global-unique + the checkout-time check.
- `Tenant.trial_ends_at` (from the trial build) is **no longer read**; left as a dead column (drop later). The session cookie and middleware switch from `trialEndsAt` → **`paidUntil`**.
- Migration is additive (`prisma db push`, session pooler): new columns on `pending_signups`, `paid_until` on `tenants`.

---

## 4. InfinitePay Integration

`src/lib/infinitepay/checkout.ts`:
- `createCheckoutLink({ orderNsu, amountCents, description })` → `POST https://api.checkout.infinitepay.io/links` with `handle` (`INFINITEPAY_HANDLE`), `items: [{ name, quantity:1, price: amountCents }]`, `order_nsu`, `webhook_url = ${APP_URL}/api/webhooks/infinitepay`, `redirect_url = ${APP_URL}/signup/sucesso?order=${orderNsu}`. Auth via `INFINITEPAY_API_TOKEN`. Returns `{ checkoutUrl, invoiceSlug }`.
- **Env (user-provided):** `INFINITEPAY_HANDLE`, `INFINITEPAY_API_TOKEN`.
- Plan prices (centavos), single source: `PLAN_PRICE_CENTS = { basic: 8900, pro: 16900 }` (mirror the landing's `plans.ts`).

**Webhook `POST /api/webhooks/infinitepay` — security (creates paid accounts, must not trust blindly):**
- Match `order_nsu` to an existing `pending` row; reject unknown.
- Verify `paid_amount === pending.amount_cents` (reject mismatched amounts).
- If InfinitePay provides a signature header, verify it (`INFINITEPAY_WEBHOOK_SECRET`); otherwise re-query the transaction via their API if available — confirm at integration time.
- **Idempotent:** if the pending is already `paid`/`consumed`, return 200 without creating a second account.
- Respond `200` in <1s (retries on 4xx per InfinitePay).

---

## 5. Renewal (month-to-month)

- Middleware reads `paidUntil` from the session cookie; if `paidUntil < now` (and not null) → redirect app routes to **`/assinar`**.
- `/assinar` (repurposed trial paywall → **renew**): "Sua assinatura venceu — renove para continuar." Button → `POST /api/subscription/renew-checkout` → creates a new InfinitePay link for the tenant's plan (`order_nsu` tied to the tenant) → redirect to pay → the same webhook extends `paid_until += 1 month` and refreshes the cookie on next login/request.
- **Countdown banner** (reuse): "Sua assinatura vence em N dias" in the last ~3 days, linking to `/assinar`.
- Because `paid_until` lives in the signed cookie, a renewal takes effect on the next login or cookie refresh; to reflect immediately, `/signup/sucesso` and the renew-success path re-issue the cookie.

---

## 6. Reuse vs Replace (from the live trial build)

**Reuse:** `provision.ts` (`createTenantWithAdmin`), `signup.ts` (`validateSignup`, `slugify`), the middleware gate (switch field to `paidUntil`), `/assinar` page (→ renew), `rate-limit.ts`, the countdown banner.

**Remove:** `src/lib/email/resend.ts`, `POST /api/auth/{signup,verify,resend-verification}`, `src/app/{signup,verify}/page.tsx` (the app-hosted trial signup), the `resend` dependency, and the email-verify fields/token on `PendingSignup`. `trialStatus`/`trial_ends_at` reads.

**Add:** `src/lib/infinitepay/checkout.ts`, `POST /api/signup/checkout`, `POST /api/webhooks/infinitepay`, `src/app/signup/sucesso/page.tsx`, `POST /api/subscription/renew-checkout`, `PLAN_PRICE_CENTS`, CORS on the checkout endpoint, and the **landing cadastro form**.

---

## 7. Landing + CORS

- The cadastro form lives in `zapflow-landing` (dedicated page/section), posting to `{APP_URL}/api/signup/checkout`.
- The PDV `/api/signup/checkout` sets CORS headers allowing the landing origin (`https://zapflow-landing.vercel.app` + the prod domain) and handles the `OPTIONS` preflight.
- Success + renew pages live in the PDV app.

---

## 8. Error Handling & Testing

**Errors:** InfinitePay link-creation failure → 502 + the pending row is deleted so the customer can retry. Webhook amount mismatch → logged + ignored (no account). Success page timeout waiting for the webhook → "pagamento em processamento, você receberá acesso em instantes" + a login link.

**Testing (Vitest):** checkout-link builder (payload shape, correct amount per plan); webhook handler (valid → creates account once; duplicate → no-op; unknown order → rejected; amount mismatch → rejected); `paidUntil` gate (null never blocks; past → /assinar; future → allowed); `PLAN_PRICE_CENTS` matches the landing. **E2E:** cadastro → stubbed InfinitePay link → stubbed webhook → account active → auto-login; expired `paid_until` → `/assinar` → renew webhook extends.

---

## 9. Dependencies (user) & Rollout

- **InfinitePay merchant account** + `INFINITEPAY_HANDLE` (InfiniteTag) + `INFINITEPAY_API_TOKEN` (+ webhook secret if offered) — set in Vercel prod. **Confirm the exact `POST /links` payload + webhook signature scheme against InfinitePay's live docs at implementation time** (values here are from public marketing/help pages).
- `prisma db push` (session pooler) — additive.
- Landing redesign/CTA: the cadastro form replaces the "Começar agora → app/signup" links.
- The live trial `/signup` + Resend flow is removed as part of this; the deployed trial becomes pay-upfront.
