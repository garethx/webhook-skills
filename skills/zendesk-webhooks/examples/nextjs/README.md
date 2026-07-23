# Zendesk Webhooks - Next.js Example

Minimal example of receiving Zendesk webhooks with HMAC-SHA256 signature
verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Zendesk webhook with a signing secret (or use the static test secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Zendesk signing secret to `.env` as `ZENDESK_WEBHOOK_SECRET`.
   Get it from `GET /api/v2/webhooks/{webhook_id}/signing_secret` or Admin Center →
   the webhook → **Reveal secret**. For test deliveries from the webhook builder,
   use the static secret `dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==`.

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/zendesk

## Test

Run the test suite (generates real Zendesk signatures):

```bash
npm test
```

### Receive live webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 zendesk --path /webhooks/zendesk
```

No account required — the CLI creates a guest account and gives you a public URL
to set as the **Endpoint URL** on your Zendesk webhook.

## Endpoint

- `POST /webhooks/zendesk` — Receives and verifies Zendesk webhook events

## Key Detail

The handler reads the **raw request body** via `await request.text()` before
parsing. Zendesk signs `timestamp + rawBody`, so the raw bytes must be hashed
exactly as received — parsing/re-serializing first would break verification.
