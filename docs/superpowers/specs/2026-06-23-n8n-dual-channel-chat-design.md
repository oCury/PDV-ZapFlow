# n8n Dual-Channel AI Support Agent — Design Spec

**Date:** 2026-06-23
**Status:** Approved (design) — pending implementation plan
**Sub-project 1 of 2** (see also: 2026-06-23-n8n-reports-agent-design.md)

## Goal

Route the **in-app support chat** AND **inbound WhatsApp messages** through a single
self-hosted **n8n** AI agent (Gemini Flash-Lite). One agent, two entry points — this
is the "dual response" the user asked for. Centralizes the AI logic + API key in n8n
and gives consistent answers on both channels.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| n8n hosting | Self-hosted (Docker on a VPS) |
| Chat path | Routed through n8n (non-streaming) |
| "Dual response" | Two channels: in-app chat + WhatsApp, same agent |
| LLM | Gemini Flash-Lite (`gemini-3.1-flash-lite`) — key lives in n8n |

## Current state

- In-app chat: `src/app/api/support/chat/route.ts` calls Gemini directly and **streams**
  tokens; `src/components/support-chat.tsx` reads the stream.
- WhatsApp: `src/app/api/whatsapp/webhook/route.ts` exists but its handlers are
  placeholders (no AI). Evolution API lib at `src/lib/whatsapp/evolution-api.ts`
  (`sendText({ number, text })`).
- Evolution (production): URL `https://wsapi.zapflow.chat`, instance `PDV-TESTE`.
  (Note: prod env vars `EVOLUTION_API_URL`/`EVOLUTION_INSTANCE_NAME` currently carry a
  trailing `\n` — clean before relying on them.)

## Architecture

```
In-app chat ─→ /api/support/chat (proxy) ─┐
                                          ├─(POST + shared secret)→ n8n "AI Support Agent" → Gemini → reply
WhatsApp ─→ Evolution webhook ────────────┘                                   │
                                                                              └─→ (WhatsApp path) Evolution sendText → customer
```

### 1. In-app chat (app → n8n)
- `/api/support/chat` stops calling Gemini. It keeps **auth + per-user rate-limit +
  message-length cap**, then POSTs `{ messages }` to the n8n chat webhook with header
  `X-Webhook-Token: <N8N_WEBHOOK_TOKEN>`.
- n8n runs the AI Agent (system prompt = current pt-BR PDV-ZapFlow prompt) and returns
  `{ reply: string }` via a "Respond to Webhook" node.
- The route returns the reply as JSON (non-streaming).
- **`support-chat.tsx`** changes from stream-reading to a single JSON response: show the
  typing indicator (`LoadingDots`) until the reply arrives, then render it. Existing
  error handling/abort stays.
- **Tradeoff (accepted):** the live token-by-token streaming is lost; the widget shows a
  loading state then the full answer.

### 2. WhatsApp (Evolution → n8n)
- Point Evolution API's webhook at the **n8n WhatsApp webhook** (or forward via the
  existing `/api/whatsapp/webhook`). Recommended: Evolution → n8n directly to keep the
  app thin; the app route stays as a no-op/health endpoint.
- n8n receives the inbound message event, runs the **same agent core**, and replies via
  Evolution `POST /message/sendText/{instance}` (instance `PDV-TESTE`).
- Only handle inbound text from end-customers; ignore status/ack events.

### 3. Key migration
- The **Gemini API key moves into n8n credentials**. The app **no longer needs
  `GEMINI_API_KEY`** (resolves the "key not set in Vercel" item). The old direct-call
  code path is removed.

## App-side changes
- `src/app/api/support/chat/route.ts` — replace Gemini call with n8n webhook fetch
  (keep guards). New env: `N8N_CHAT_WEBHOOK_URL`, `N8N_WEBHOOK_TOKEN`.
- `src/components/support-chat.tsx` — non-streaming response handling.
- `.env.example` — replace `GEMINI_API_KEY`/`GEMINI_MODEL` with `N8N_CHAT_WEBHOOK_URL`,
  `N8N_WEBHOOK_TOKEN`. Remove `@google/genai` dependency (now unused in the app).
- `src/app/api/whatsapp/webhook/route.ts` — document/forward to n8n (or leave as no-op
  if Evolution points directly at n8n).

## n8n side (delivered as importable workflow JSON + setup docs)
- One workflow with two webhook triggers (chat + WhatsApp) → shared AI Agent (Gemini)
  → channel-specific response (Respond-to-Webhook for chat; Evolution sendText for WA).
- Credentials in n8n: Gemini API key, Evolution API (URL + key + instance).
- Webhooks protected by the shared secret; n8n served over HTTPS (reverse proxy).

## Security
- Shared-secret header on the app→n8n chat webhook; reject otherwise.
- Evolution→n8n protected by Evolution's webhook token.
- n8n behind HTTPS on the VPS; the Gemini key never leaves n8n.
- App keeps auth + rate-limit + length-cap before forwarding.

## Testing
- App: proxy route with a mocked n8n endpoint (200 → reply rendered; 4xx/5xx → error
  bubble); widget renders single response + abort still works.
- n8n: test both webhooks from the editor + `curl`.
- WhatsApp: send a test message to `PDV-TESTE` → AI reply received.

## Division of labor
- **Claude:** app route + widget changes, `.env.example`, dependency cleanup, the n8n
  workflow JSON, read-me/setup docs.
- **User (cannot be automated here):** provision VPS + run n8n (Docker), import workflow,
  set n8n credentials, point Evolution webhook, set `N8N_*` env in Vercel.

## Out of scope (v1 — YAGNI)
- Restoring streaming through n8n (possible later via SSE proxy; not now).
- Human-handoff/escalation, conversation persistence, analytics.
- Tools for the support agent (it answers from the system prompt only; report data is
  the other sub-project).

## Build order
Build this (chat dual-channel) **first**; then the reports agent (separate spec/plan).
