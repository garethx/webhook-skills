# Tebex Webhooks - Next.js Example

Minimal example of receiving Tebex webhooks with signature verification using
the Next.js App Router.

## Prerequisites

- Node.js 18+
- Tebex store with a webhook secret (Creator Panel → Developers → Webhooks → Endpoints)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Tebex webhook secret to `.env` (`TEBEX_WEBHOOK_SECRET`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Receive real webhooks locally

Use the Hookdeck CLI to tunnel Tebex webhooks to your local server:

```bash
npx hookdeck-cli listen 3000 tebex --path /webhooks/tebex
```

Point your Tebex endpoint at the URL the CLI prints. Editing and saving the
endpoint re-sends a `validation.webhook` — this handler echoes the `id` back
with a 200 to activate it.

## How verification works

The route reads the raw body with `request.text()` **before** parsing, then
verifies the hex `X-Signature` header. Tebex signs in two steps: SHA-256 the raw
body, then HMAC-SHA256 that hash with your webhook secret.

## Endpoint

- `POST /webhooks/tebex` - Receives and verifies Tebex webhook events
  (see `app/webhooks/tebex/route.ts`)
