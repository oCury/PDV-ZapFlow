# Commercialization Layer — Scope Stub (Billing, Subscriptions, NF)

**Date:** 2026-06-27
**Status:** SCOPE STUB — not yet brainstormed/specced. Decompose & build in fresh sessions.
**Repo:** PDV-ZapFlow
**Depends on:** tenancy foundation (`2026-06-25-tenancy-foundation-design.md`) +
entitlements matrix (`2026-06-25-plans-entitlements.md`). MP Connect (sub-project B) is parallel.

> Three new requirements (Andre, 2026-06-27): (1) "liberar o acesso por plano após o pagamento",
> (2) "verificação de pagamento para acesso", (3) NF — **both** billing NFS-e and POS NF-e.
> Each sub-project below gets its own brainstorm → spec → plan → build.

## Sub-project C1 — Billing & Subscriptions (items 1 & 2)

Client pays for a plan → access to that plan's modules is unlocked; ongoing payment status gates access.

- **`Subscription` model per tenant:** provider, provider_customer_id, provider_subscription_id,
  `plan` (basic/pro/enterprise), `status` (active | past_due | canceled | trialing),
  `current_period_end`, seat add-ons count.
- **Activation:** provider **webhook** → set `tenant.plan` + `Subscription.status` → entitlements
  (from the matrix) unlock. ("Liberar acesso por plano após pagamento.")
- **Access verification (runtime gate):** middleware/guard checks the tenant has an **active**
  subscription before serving app routes; `past_due`/`canceled` → restricted state + upsell/pay
  screen (don't hard-500). ("Verificação de pagamento para acesso.")
- **Seat add-on:** Pro = 3 included + per-seat add-on (see entitlements doc) → reflect in subscription
  quantity; enforce at user-invite.
- **Provider decision (Phase 0):** Mercado Pago **Assinaturas/preapproval** (already use MP) vs a BR
  SaaS biller (**Iugu / Asaas / Vindi**). Trade-off: Iugu/Asaas/Vindi **also emit NFS-e** → could cover
  C2 in one. Trial = 7 days of a paid plan (no free tier).

## Sub-project C2 — Billing NFS-e (item 3a: your SaaS → client)

Issue a **nota fiscal de serviço (NFS-e)** when charging a client for their subscription.

- Trigger on each paid subscription invoice (from C1's webhook).
- **Two routes:** (a) the biller emits NFS-e natively (Iugu/Asaas/Vindi) — least work; or (b) emit via
  the existing fiscal provider the PDV already uses for NFC-e (**FocusNFe / PlugNotas** both do NFS-e).
- Needs the SaaS company's fiscal config (município, código de serviço, alíquota ISS, regime).
- Store issued NFS-e refs against the `Subscription`/invoice.

## Sub-project D — POS NF-e modelo 55 (item 3b: shop → consumer)

Let the shop's customer **order a full NF-e (mod. 55)** for specific products in a sale — beyond the
NFC-e (mod. 65) coupon the PDV already issues.

- **Extends the existing fiscal module** (the PDV already has `Sale.nfce_*` fields, `FiscalQueue`/
  `FiscalEvent`, `/api/fiscal/emit`, FocusNFe/PlugNotas). Add **model 55** emission alongside 65.
- UI at checkout / post-sale: "Emitir NF-e" → capture **destinatário** (CPF/CNPJ, nome, endereço,
  IE) + select which products/items → emit. ("O cliente pode pedir NF para alguns produtos.")
- Needs full product fiscal data (NCM/CFOP/CST/origem already partly on `Product`: ncm/cfop/fiscal_unit).
- Tenant-scoped (each loja's own fiscal credentials) — depends on multi-tenancy + per-tenant fiscal config.

## How these slot together

```
Tenancy (A) ──┬── Entitlements matrix (done) ── C1 Billing/Subscriptions ── gates access by plan+payment
              ├── MP Connect (B)  ── per-tenant maquininha
              ├── C2 Billing NFS-e (subscription invoices)
              └── D  POS NF-e mod.55 (per-tenant fiscal config; extends NFC-e module)
```

## Phase 0 (next session, before building)

- [ ] Pick billing provider (MP Assinaturas vs Iugu/Asaas/Vindi) — weigh native NFS-e (covers C2).
- [ ] Confirm SaaS fiscal setup for NFS-e (município/CNAE/ISS).
- [ ] Confirm the PDV's current fiscal provider creds support **NF-e mod 55** (not just 65).
- [ ] Decide access-restriction UX for past_due/canceled (read-only? pay-wall screen?).

## How to start next session

> Prompt: *"Build the billing & subscriptions layer for PDV-ZapFlow"* (sub-project C1 first),
> reading this doc + `2026-06-25-plans-entitlements.md` + the tenancy plan. C2 (NFS-e) and D
> (POS NF-e mod 55) follow as their own spec→plan→build. **Tenancy (A) should land first** since
> subscriptions/fiscal config are per-tenant.
