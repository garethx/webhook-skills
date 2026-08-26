# Supabase Webhooks - Next.js Example

Next.js App Router routes for both Supabase webhook surfaces, each with the
correct security model:

| Route | File | Surface | How it's authenticated |
|-------|------|---------|------------------------|
| `POST /webhooks/supabase` | `app/webhooks/supabase/route.ts` | Database Webhooks (`INSERT` / `UPDATE` / `DELETE`) | **No signature exists.** Constant-time compare of a shared secret you configure in the trigger's headers JSON |
| `POST /webhooks/supabase/auth-hook` | `app/webhooks/supabase/auth-hook/route.ts` | Auth Hooks (`send_email`, `send_sms`, `custom_access_token`, `before_user_created`, `mfa_verification_attempt`, `password_verification_attempt`) | Standard Webhooks HMAC-SHA256 via the `standardwebhooks` package |

## Prerequisites

- Node.js 18+
- A Supabase project
- For Auth Hooks: the hook secret from **Authentication → Hooks** (starts with `v1,whsec_`)
- For Database Webhooks: a shared secret you generate yourself (`openssl rand -base64 32`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Fill in `.env.local`:
   - `SUPABASE_AUTH_HOOK_SECRET` — paste the Supabase-issued value **including** the `v1,whsec_` prefix
   - `SUPABASE_WEBHOOK_SECRET` — the secret you generated for Database Webhooks

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests generate real signatures with Supabase's exact algorithm —
`base64(HMAC_SHA256(base64_decode(secret_after_v1_whsec_), "{webhook-id}.{webhook-timestamp}.{raw_body}"))` —
and include a case asserting that signing with the *undecoded* base64 string is
rejected, since that is the most common implementation bug.

## Receive real webhooks locally

`--path` **replaces** the forwarded request path rather than appending to it,
so run one tunnel per surface, each with its own source:

```bash
# Database Webhooks
npx hookdeck-cli listen 3000 supabase --path /webhooks/supabase

# Auth Hooks — a separate source, because --path replaces the request path
npx hookdeck-cli listen 3000 supabase-auth-hook --path /webhooks/supabase/auth-hook
```

Use the first printed URL as the Database Webhook URL in
**Integrations → Webhooks**, and the second as the Auth Hook URI in
**Authentication → Hooks**.

## Notes

- Both routes read the body with `await request.text()`. The Auth Hook signature
  covers the **exact raw body bytes** — `await request.json()` re-serialises and
  breaks verification. App Router route handlers do not body-parse for you, so
  there is no `bodyParser: false` config needed (that was a Pages Router
  concern).
- Auth Hooks are **request/response**: the auth flow blocks on your reply and the
  JSON you return changes what Supabase does. The whole invocation has a
  **5-second budget including up to three retries** (on 429/503) at a two-second
  backoff, so keep the handler fast and do slow work out of band.
- Database Webhooks are fire-and-forget via `pg_net` with the trigger's
  `timeout_ms`. Supabase documents **no retry policy and no delivery id**, so
  make your handler idempotent by deduping on a primary key inside `record`.
- If you deploy to a serverless platform, avoid module-level state for
  deduplication — use Redis or Postgres.
- Supabase documents **no source-IP allowlist and no `user-agent` value** for
  either surface — don't build either into your receiver.
