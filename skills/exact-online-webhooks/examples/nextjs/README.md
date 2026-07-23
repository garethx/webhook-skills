# Exact Online Webhooks - Next.js Example

Minimal example of receiving Exact Online webhooks in a Next.js App Router route
handler with `HashCode` signature verification.

## Prerequisites

- Node.js 18+
- An Exact Online OAuth app with a **Webhook secret** (from the App Center)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Exact App Center **Webhook secret** to `.env` as `EXACT_WEBHOOK_SECRET`.
   (This is the Webhook secret, not the OAuth client secret.)

## Run

```bash
npm run dev
```

The webhook route is served at `POST http://localhost:3000/webhooks/exact-online`.

## Test

Run the unit tests (they generate real `HashCode` signatures and exercise the
route handler):

```bash
npm test
```

## Receive real webhooks locally

Start a tunnel (no account required) and point it at your local handler:

```bash
npx hookdeck-cli listen 3000 exact-online --path /webhooks/exact-online
```

Register the printed public URL as the `CallbackURL` when you create a
subscription via `POST /api/v1/{division}/webhooks/WebhookSubscriptions`.

## How It Works

- Exact POSTs `{"Content":{…},"HashCode":"<hex>"}`.
- The route reads the **raw body** with `await request.text()`, computes
  HMAC-SHA256 over the raw `Content` JSON keyed with `EXACT_WEBHOOK_SECRET`,
  hex-encodes and uppercases it, and compares to `HashCode` (401 on mismatch).
- The payload is thin, so fetch the full record from the REST API using
  `Content.Key` + `Content.Division`, then return **200** quickly.

See [../../references/verification.md](../../references/verification.md) for details.
