# Plans & Entitlements — module → plan matrix

**Date:** 2026-06-25
**Status:** Agreed split (Andre, 2026-06-25). Source of truth for plan gating.
**Repo:** PDV-ZapFlow
**Related:** `2026-06-25-multitenancy-mp-connect-scope.md` (enforcement lives in that build),
landing `zapflow-landing/src/lib/plans.ts` (marketing mirror of this).

## Tiers

| Tier | Users (`staff`) | Stores | Who |
|---|---|---|---|
| **Basic** | 1 | single | starting out |
| **Pro** | **up to 3** | single | growing loja |
| **Enterprise / sob medida** | unlimited | multi (`multistore`) | redes/franquias — "fale com a gente" |

> Pro includes **3 users**; extra users = **per-seat add-on**. Multi-store → Enterprise.
> No free tier — 7-day trial only. (Andre, 2026-06-25.)

## Module → entitlement keys → plan

Each module has a stable **key** used for enforcement (`tenant.plan` ⇒ allowed keys).

| Module | Key | Basic | Pro | Enterprise |
|---|---|:--:|:--:|:--:|
| PDV / venda presencial | `pdv` | ✅ | ✅ | ✅ |
| Catálogo + grade + categorias | `catalog` | ✅ | ✅ | ✅ |
| Estoque por SKU + baixa + low-stock | `inventory` | ✅ | ✅ | ✅ |
| Pagamentos dinheiro/PIX/cartão | `payments.core` | ✅ | ✅ | ✅ |
| Maquininha Mercado Pago (crédito/débito/PIX) | `payments.terminal` | ✅ | ✅ | ✅ |
| Clientes (CRM) | `customers` | ✅ | ✅ | ✅ |
| Caixa (turnos/sangria) | `cashregister` | ✅ | ✅ | ✅ |
| Relatórios essenciais (dashboard) | `reports.basic` | ✅ | ✅ | ✅ |
| Parcelamento na maquininha | `payments.installments` | — | ✅ | ✅ |
| NFC-e | `fiscal.nfce` | — | ✅ | ✅ |
| Follow-up WhatsApp | `whatsapp` | — | ✅ | ✅ |
| Fidelidade & cashback | `loyalty` | — | ✅ | ✅ |
| Vale-presente & trocas | `vouchers` | — | ✅ | ✅ |
| Comissão de vendedores | `commissions` | — | ✅ | ✅ |
| Entregas | `deliveries` | — | ✅ | ✅ |
| Etiquetas / código de barras | `labels` | — | ✅ | ✅ |
| Mesas & comandas | `tables` | — | ✅ | ✅ |
| Relatórios avançados (ABC/margem/giro) | `reports.advanced` | — | ✅ | ✅ |
| Equipe & permissões | `staff` | 1 | 3 | ∞ |
| Multi-loja | `multistore` | — | — | ✅ |

## Enforcement (built in the multi-tenancy project)

- A `Plan` (basic/pro/enterprise) is a property of the **tenant**.
- Map plan → set of allowed entitlement keys (a static config, e.g. `src/lib/entitlements.ts`).
- Gate at three layers: **API routes** (reject/4xx if the tenant's plan lacks the key),
  **UI** (hide/disable modules + upsell prompt), **limits** (`staff` count check on user-invite).
- Keep this matrix and the landing `plans.ts` in sync with the config; ideally generate the
  landing's feature lists from the same key set.

## Decisions (resolved 2026-06-25)

- **No free tier.** Only a 7-day trial of a paid plan (Basic/Pro).
- **`payments.terminal` (maquininha) stays in Basic** — it's table-stakes; every competitor
  offers it, so it can't be a Pro-only lever.
- **Pro includes 3 users; extra users = per-seat add-on** (not forced to Enterprise). On Pro,
  `staff` is a **soft limit with paid overage**, not a hard cap. Enterprise = unlimited + `multistore`.
  → Enforcement: at user-invite, allow beyond 3 only if a per-seat add-on is active; surface the
  add-on/upsell instead of blocking.
