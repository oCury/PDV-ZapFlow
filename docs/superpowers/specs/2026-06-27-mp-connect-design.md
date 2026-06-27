# Mercado Pago Connect (per-tenant OAuth) — Design Spec

**Date:** 2026-06-27
**Status:** APPROVED design — ready for implementation plan
**Repo:** PDV-ZapFlow
**Sub-project:** B (of the multi-tenancy + MP Connect roadmap)
**Depends on:** A — Tenancy foundation (MERGED, PR #6). `Tenant` + `MpConnection` models, `tenant_id`
row scoping, AsyncLocalStorage tenant context (`getTenantId`/`runWithTenant`/`enterTenant`) all live on `main`.
**Branch / base:** `feat/mp-connect` off `origin/main` (2335a27). Worktree `.worktrees/feat-mp-connect`.

---

## 1. Problem

The Mercado Pago Point (maquininha) integration shipped in `2026-06-24-mercadopago-point-terminal-design.md`
authenticates every call with a single `process.env.MERCADOPAGO_ACCESS_TOKEN`. One token = one MP account,
so the platform can serve only **one** store's terminals. The product is multi-tenant (each loja logs in and
must use **its own** MP account / maquininha), so the env token must be replaced with **per-tenant** OAuth
credentials obtained through Mercado Pago's OAuth/Connect (marketplace) flow.

Sub-project A already created the persistence model (`MpConnection`, one row per tenant) and the request-scoped
tenant context. This sub-project builds the OAuth flow that fills that model and rewires every MP call to use
the current tenant's token.

`src/lib/mercadopago/finalize.ts` already carries the marker for this work:
`// TODO: make webhook fully tenant-aware when multi-MP-account support lands.`

## 2. Goals / Non-goals

**Goals**
- "Conectar Mercado Pago" OAuth flow: authorize → callback → store the tenant's credentials.
- Encrypt `access_token` / `refresh_token` at rest.
- Automatic token refresh (MP access tokens expire; refresh tokens rotate).
- Every Point/Orders call uses the **current tenant's** token instead of the env token.
- Webhooks resolve to the correct tenant before reconciliation.
- Minimal settings UI: connect / status / disconnect.
- Interim fallback to the env token for tenants without a connection (keeps Tenant #1 working during rollout).

**Non-goals**
- Tenancy model / data scoping (done in A).
- Billing, plans, entitlements (sub-project C).
- Creating/enabling the MP developer application itself — a documented **prerequisite** (§3), not code.
- Per-tenant webhook *secret* rotation — webhook signature validation stays app-level (existing
  `MERCADOPAGO_WEBHOOK_SECRET`); a separate hardening item.

## 3. Prerequisites (MP-side, manual — not code)

These are required before the live flow can be exercised; the code is built and merged independently of them.

1. A Mercado Pago **application** with **OAuth / Connect (marketplace mode)** enabled.
2. The app's `client_id` and `client_secret`.
3. A registered **redirect URI** matching `MP_OAUTH_REDIRECT_URI` (e.g. `https://pdv-zap-flow.vercel.app/api/mp/oauth/callback` and a localhost variant for dev).
4. **Point integrator enablement** — resolves the `403 "Integrator isn't registered"` at the app level.
   This is the one **open external risk**; confirm with MP commercial. Card-present terminal calls cannot be
   verified live until it is done, but the OAuth/token layer can be fully built, unit-tested, and merged.

## 4. Environment / config

New env vars (added in Vercel + `.env`; **not** a DB migration):

| Var | Purpose |
|---|---|
| `MP_OAUTH_CLIENT_ID` | MP application id (same for all tenants) |
| `MP_OAUTH_CLIENT_SECRET` | MP application secret |
| `MP_OAUTH_REDIRECT_URI` | Absolute callback URL registered with MP |
| `MP_TOKEN_ENC_KEY` | 32-byte hex key for AES-256-GCM token encryption |
| `MP_OAUTH_STATE_SECRET` | *(optional)* HMAC key for the OAuth `state`; falls back to `MP_OAUTH_CLIENT_SECRET` if unset |
| `MERCADOPAGO_ACCESS_TOKEN` | **Reused** as the interim fallback for unconnected tenants |

Startup validation: fail fast if `MP_TOKEN_ENC_KEY` is malformed (wrong length / non-hex). OAuth vars are only
required when a connect is actually attempted (so the app still boots in env-token fallback mode without them).

## 5. Data model

**No schema change.** `MpConnection` (from A) already has every field:

```
MpConnection {
  id, tenant_id @unique, mp_user_id, access_token, refresh_token,
  public_key?, scope?, token_type?, live_mode, access_token_expires_at?,
  created_at, updated_at
  @@index([mp_user_id])
}
```

`access_token` / `refresh_token` store **ciphertext** (AES-256-GCM), not plaintext. The columns are plain
`String`, so no migration is needed — only the application layer changes what it writes.

## 6. Components

Each unit is small, single-purpose, and independently testable.

### 6.1 `src/lib/crypto/secretBox.ts` (new)
- `encryptSecret(plaintext): string` and `decryptSecret(ciphertext): string` using AES-256-GCM.
- Key from `MP_TOKEN_ENC_KEY` (validated 32-byte hex). Output format: `v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`
  (versioned for future key rotation).
- Pure, no DB. Unit-tested (round-trip, tamper-detection, malformed-key rejection).

### 6.2 `src/lib/mercadopago/oauth.ts` (new)
- `buildAuthorizeUrl({ tenantId }): string` → `https://auth.mercadopago.com/authorization` with
  `client_id`, `response_type=code`, `platform_id=mp`, `redirect_uri`, signed `state`, and PKCE
  (`code_challenge`, `code_challenge_method=S256`).
- `exchangeCodeForTokens({ code, codeVerifier }): MpTokenResponse` → `POST https://api.mercadopago.com/oauth/token`
  with `grant_type=authorization_code`.
- `refreshTokens({ refreshToken }): MpTokenResponse` → same endpoint, `grant_type=refresh_token`.
- Token response shape: `{ access_token, refresh_token, user_id, expires_in, public_key, scope, token_type, live_mode }`.
- Pure HTTP + mapping; network mocked in tests.

### 6.3 `src/lib/mercadopago/oauthState.ts` (new)
- `signState({ tenantId }): string` and `verifyState(state): { tenantId }` — HMAC-SHA256 over
  `{ tenantId, nonce, exp }`, signed with a dedicated `MP_OAUTH_STATE_SECRET` (falls back to
  `MP_OAUTH_CLIENT_SECRET` if unset).
- CSRF protection + binds the callback to the tenant that initiated it. Short TTL (e.g. 10 min).
- PKCE `code_verifier` is also round-tripped via a signed/`httpOnly` cookie set at authorize time.

### 6.4 `src/lib/mercadopago/connection.ts` (new) — token resolution
- `resolveMpAccessToken(tenantId): Promise<string>`:
  1. Load `MpConnection` for `tenantId` (via `basePrisma`, looked up by `tenant_id` — connection lookup is
     itself a tenant-keyed read, not a tenant-scoped query).
  2. If none → return the env token via `getAccessToken()` (interim fallback) or throw a typed
     `MpNotConnectedError` if the env token is also absent.
  3. If `access_token_expires_at` is past or within a 24h buffer → `refreshTokens()`, persist the **rotated**
     refresh token + new access token + new expiry (encrypted), then use.
  4. Decrypt and return the access token.
- `saveConnection(tenantId, tokenResponse)` and `deleteConnection(tenantId)` (encrypt on write).
- Refresh single-flight: conditional `updateMany` guarded on the old `updated_at`/token so a concurrent refresh
  doesn't clobber; a rare double-refresh is acceptable and harmless.

### 6.5 `src/lib/mercadopago/client.ts` (refactor)
- `mpFetch(path, init & { accessToken: string })` — token passed in explicitly (Option A). Remove the internal
  `getAccessToken()` env read from the fetch path. Keep `getAccessToken()` only as the fallback source inside
  `resolveMpAccessToken`.

### 6.6 Call-site updates (resolve token at the boundary where tenant is known)
- `src/lib/mercadopago/devices.ts`, `orders.ts` — accept an `accessToken` and thread it into `mpFetch`.
- Routes `src/app/api/terminals/*`, `src/app/api/checkout/terminal-charge/*` — resolve
  `resolveMpAccessToken(getTenantId())` at the start of the handler and pass it down.
- `src/lib/mercadopago/finalize.ts` — runs under an explicit tenant (see 6.8); resolves the token from the
  tenant mapped off the webhook.

### 6.7 OAuth routes (new)
- `GET /api/mp/oauth/start` — authenticated; builds the authorize URL for `getTenantId()`, sets the PKCE
  cookie, redirects to MP.
- `GET /api/mp/oauth/callback` — verifies `state` (→ tenantId), reads PKCE cookie, exchanges the code,
  `saveConnection`, redirects back to settings with success/error. Handles MP `error`/`error_description`.

### 6.8 Webhook → tenant routing
- `src/app/api/webhooks/mercadopago/route.ts` — after signature validation, extract the collector
  `user_id` from the notification, map `MpConnection.mp_user_id → tenant_id` (uses `@@index([mp_user_id])`),
  then run reconciliation inside `runWithTenant(tenantId, () => finalizeCharge(...))`. If no mapping is found,
  fall back to current single-tenant behavior (Tenant #1) and log. Replaces the `TODO` in `finalize.ts`.

### 6.9 Settings UI
- A "Conectar Mercado Pago" action in `/settings` (terminals/payments area): when disconnected, a connect
  button → `/api/mp/oauth/start`; when connected, show status (`mp_user_id`, `live_mode`, scope) + a disconnect
  button → `deleteConnection`. Designed states for connect/connected/error.

## 7. Data flows

**Connect:** user (settings) → `GET /api/mp/oauth/start` → redirect to MP authorize → user authorizes →
MP → `GET /api/mp/oauth/callback?code,state` → verify state, exchange code → encrypt + `saveConnection` →
redirect to settings (connected).

**Charge (request path):** route handler enters tenant context (A) → `resolveMpAccessToken(getTenantId())`
(refresh if needed) → `mpFetch(path, { accessToken })` → MP.

**Refresh (lazy):** any `resolveMpAccessToken` call that sees an (near-)expired token refreshes inline and
persists the rotated pair before returning.

**Webhook:** MP → `/api/webhooks/mercadopago` → validate signature → map `user_id → tenant` →
`runWithTenant(tenant, finalizeCharge)`.

## 8. Error handling

- `MpNotConnectedError` (typed) when a tenant has no connection and no env fallback — surfaced to the UI as a
  clear "Conecte sua conta Mercado Pago" message, **not** the existing misleading "Maquininha sem conexão".
- OAuth callback errors (denied consent, bad state, expired state, exchange failure) → redirect to settings
  with a specific message; never 500.
- Refresh failure (e.g. revoked refresh token) → mark the connection stale, surface "reconecte sua conta", and
  do **not** silently fall back to another account's env token for a tenant that *was* connected.
- Encryption: tamper/decrypt failure throws and is logged with context (never returns a corrupt token).

## 9. Security

- Tokens encrypted at rest (AES-256-GCM, versioned envelope, env key).
- `state` HMAC-signed + short TTL; PKCE on the authorization code.
- PKCE verifier in an `httpOnly`, `Secure`, `SameSite=Lax` cookie, cleared on callback.
- Connection lookup keyed strictly by `tenant_id` from the authenticated session — a tenant can never read or
  write another tenant's `MpConnection`.
- No tokens in logs.

## 10. Testing

- `secretBox`: round-trip, tamper detection, malformed key.
- `oauth`: authorize-URL construction, code exchange + refresh mapping (network mocked).
- `oauthState`: sign/verify, tamper rejection, TTL expiry.
- `connection`: fallback when unconnected, refresh-when-expiring (persists rotated token), decrypt-on-read,
  no cross-tenant read.
- `client.mpFetch`: uses the passed token, no env read.
- Webhook route: `user_id → tenant` mapping runs reconciliation in the right tenant; unmapped → fallback + log.
- Keep the existing maquininha/terminal tests green.
- Target ≥ 80% on new modules. Live end-to-end (real maquininha) gated on §3.4 enablement — documented, not
  blocking merge.

## 11. Rollout

1. Merge code (env-token fallback keeps current single-account behavior intact — zero behavior change for
   Tenant #1 until it connects).
2. Add env vars in Vercel (§4) — **needs explicit go-ahead** before touching prod config.
3. Once MP Connect + Point integrator are enabled (§3), connect Tenant #1 via the UI; verify a live charge;
   then remove the env-token fallback in a later cleanup.
4. **No prod DB migration** — `mp_connections` already exists (PR #6).

## 12. Open risks

- **MP Point integrator enablement** (§3.4) — external, owned by MP commercial. Blocks live card-present
  verification only; not the build/merge.
- Exact MP OAuth/refresh response field names + Connect webhook `user_id` placement to be confirmed against
  live MP responses during integration; mappings are isolated in `oauth.ts` / the webhook route to absorb
  any difference.
