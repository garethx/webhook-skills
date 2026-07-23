# Revolut Webhooks - Express Example

Minimal example of receiving Revolut Merchant webhooks with signature
verification.

## Prerequisites

- Node.js 18+
- A Revolut Merchant account and a webhook created via the Merchant API (see
  [../../references/setup.md](../../references/setup.md)) with its
  `signing_secret` (starts with `wsk_`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Revolut webhook signing secret to `.env`:
   ```bash
   REVOLUT_SIGNING_SECRET=wsk_xxxxx
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and the webhook endpoint is
`POST /webhooks/revolut`.

## Receive webhooks locally

Use the Hookdeck CLI to tunnel Revolut webhooks to your local server (no account
required — it creates a guest account on first run):

```bash
npx hookdeck-cli listen 3000 revolut --path /webhooks/revolut
```

Point your Revolut webhook `url` at the URL Hookdeck prints.

## How verification works

- Revolut sends `Revolut-Signature` (`v1=<hex>`, comma-separated during secret
  rotation) and `Revolut-Request-Timestamp` headers.
- The handler recomputes `HMAC-SHA256("v1.{timestamp}.{raw body}", signing_secret)`
  over the **raw** request body and compares it in constant time.
- Invalid or missing signatures return `400`; valid webhooks return `200`.

See [../../references/verification.md](../../references/verification.md) for
details and gotchas.

## Test

```bash
npm test
```

The tests generate real signatures with Revolut's algorithm and cover valid,
invalid, tampered, stale-timestamp, and rotation (multi-signature) cases.
