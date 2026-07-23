# Revolut Webhooks - Next.js Example

Minimal example of receiving Revolut Merchant webhooks in a Next.js App Router
route handler with signature verification.

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
   cp .env.example .env.local
   ```

3. Add your Revolut webhook signing secret to `.env.local`:
   ```bash
   REVOLUT_SIGNING_SECRET=wsk_xxxxx
   ```

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/revolut` — the route handler lives at
`app/webhooks/revolut/route.ts`.

## Receive webhooks locally

Use the Hookdeck CLI to tunnel Revolut webhooks to your local server (no account
required — it creates a guest account on first run):

```bash
npx hookdeck-cli listen 3000 revolut --path /webhooks/revolut
```

Point your Revolut webhook `url` at the URL Hookdeck prints.

## How verification works

- The route reads the **raw** body with `await request.text()` — never
  `request.json()` first, or the signature will not match.
- It recomputes `HMAC-SHA256("v1.{timestamp}.{raw body}", signing_secret)` and
  compares it in constant time against the `Revolut-Signature` header.
- The `Revolut-Signature` header may hold multiple comma-separated signatures
  during secret rotation; any match is accepted.

See [../../references/verification.md](../../references/verification.md) for
details and gotchas.

## Test

```bash
npm test
```

The tests generate real signatures with Revolut's algorithm and cover valid,
invalid, tampered, stale-timestamp, and rotation (multi-signature) cases.
