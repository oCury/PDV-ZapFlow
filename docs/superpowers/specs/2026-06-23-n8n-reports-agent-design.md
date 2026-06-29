# n8n Reports Agent — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — pending implementation plan
**Sub-project 2 of 2** (see also: 2026-06-23-n8n-dual-channel-chat-design.md)

## Goal

An n8n-powered **reports agent** that (a) answers natural-language questions about the
store's data on demand, and (b) sends **scheduled** pt-BR summaries to WhatsApp. Runs on
the same self-hosted n8n as the support agent.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| n8n hosting | Self-hosted (Docker on a VPS) |
| Scope | Both on-demand Q&A **and** scheduled summaries |
| Data access | n8n **Postgres node → Supabase, read-only** |
| LLM | Gemini Flash-Lite (`gemini-3.1-flash-lite`) — key in n8n |

## Current state

- Reports/analytics already exist as API routes: `/api/reports/{abc-curve, export,
  period-comparison, profit-margin, stale-products, stock-turnover}` and
  `/api/analytics/{dashboard, revenue/*, categories, top-sellers}`.
- Data in Supabase Postgres (same DB as prod). Schema includes `sales`, `sale_items`,
  `products`, `product_variants`, `customers`, `categories`, `deliveries`, etc.
- Evolution (production): `https://wsapi.zapflow.chat`, instance `PDV-TESTE`.

## Architecture

```
"Relatórios IA" (app) ─(POST + shared secret)→ n8n "Reports Agent" ─(read-only Postgres)→ Supabase → pt-BR answer
Cron (e.g. daily 08:00) ───────────────────→ n8n "Reports Agent" → fixed queries → summary → Evolution → owner WhatsApp
```

### 1. On-demand Q&A
- A small **"Relatórios IA"** entry in the app (new admin-only page, or a "reports mode"
  toggle reusing the chat widget) POSTs a natural-language question + shared secret to a
  dedicated n8n webhook.
- n8n AI Agent (Gemini) is given the **schema context** and a set of **predefined,
  parameterized query tools** (preferred over free-form SQL) — e.g. `top_sellers(period)`,
  `revenue(period)`, `margin_by_category(period)`, `low_stock()`, `stale_products(days)`.
  It selects a tool, runs it via the read-only Postgres connection, and answers in pt-BR.
- Returns `{ reply }` to the app, rendered like the chat.

### 2. Scheduled summaries
- n8n **Schedule (Cron)** trigger (default daily 08:00 America/Sao_Paulo) runs a fixed
  query set (vendas do dia anterior, top produtos, estoque baixo, total de entregas
  pendentes) → formats a concise pt-BR summary → sends via Evolution `sendText` to the
  owner's number (configurable in n8n).

## Safety (critical — agent touches the production DB)
- **Read-only Postgres role** in Supabase used by n8n (SELECT-only; cannot INSERT/UPDATE/
  DELETE/DDL). SQL to create it is delivered with this work. Defense-in-depth even if a
  query tool is misused or prompt-injected.
- **Prefer predefined parameterized query tools** over agent-authored free-form SQL, to
  bound cost and eliminate injection → destructive/expensive queries. (If free-form SQL
  is enabled later, force `LIMIT`, statement timeout, and the read-only role.)
- Shared-secret header on the app→n8n webhook.
- Statement timeout on the read-only role to cap runaway queries.

## App-side changes
- New admin-only **"Relatórios IA"** UI (page or chat-mode) that POSTs questions to the
  reports n8n webhook. New env: `N8N_REPORTS_WEBHOOK_URL` (reuses `N8N_WEBHOOK_TOKEN`).
- Sidebar entry (admin-only).
- No change to existing `/api/reports/*` (the agent reads the DB directly, not these
  endpoints — chosen for simplicity and to avoid adding token-auth to those routes).

## n8n side (delivered as importable workflow JSON + setup docs)
- Workflow A: webhook → AI Agent + Postgres (read-only) tools → Respond-to-Webhook.
- Workflow B: Cron → queries → format → Evolution sendText.
- Credentials in n8n: Gemini key, **read-only** Supabase Postgres, Evolution API.

## Testing
- **Read-only proof:** attempt an INSERT/UPDATE/DELETE through the n8n DB credential →
  must be denied by the role.
- Q&A: validate a handful of known questions against hand-checked numbers.
- Scheduled: trigger the cron manually in n8n → summary delivered to the test WhatsApp.
- App: reports UI posts and renders; admin-only access enforced.

## Division of labor
- **Claude:** the read-only role SQL, the predefined query definitions, the app
  "Relatórios IA" UI + proxy, the n8n workflow JSON, setup docs.
- **User (cannot be automated here):** create the read-only DB role (run the SQL),
  import workflows, set n8n credentials, set the owner WhatsApp number + schedule,
  set `N8N_REPORTS_WEBHOOK_URL` in Vercel.

## Out of scope (v1 — YAGNI)
- Agent-authored free-form SQL (start with predefined tools).
- Charts/visual report generation (text answers only).
- Multi-user report personalization.

## Dependency
Build **after** the dual-channel chat sub-project (shared n8n + Evolution credentials +
the `N8N_WEBHOOK_TOKEN` convention are established there).
