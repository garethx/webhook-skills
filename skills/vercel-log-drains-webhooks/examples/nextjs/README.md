# Vercel Log Drains - Next.js Example

Minimal example of receiving Vercel Log Drains deliveries with `x-vercel-signature`
verification (HMAC-SHA1) using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Vercel team on a Pro or Enterprise plan with a log drain configured
- Your drain's **signature secret** and **verification token**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your drain signature secret (`VERCEL_LOG_DRAIN_SECRET`) and verification
   token (`VERCEL_VERIFY`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route handler lives at
`app/webhooks/vercel-log-drains/route.ts`.

## Test

```bash
npm test
```

### Receive real deliveries locally

Tunnel Vercel deliveries to your local server with the Hookdeck CLI (no account
required):

```bash
npx hookdeck-cli listen 3000 vercel-log-drains --path /webhooks/vercel-log-drains
```

## How It Works

- The App Router reads the **raw body** with `request.text()` before parsing, so
  the HMAC-SHA1 signature check runs against the exact bytes Vercel signed.
- The `x-vercel-verify` response header is echoed so the create/test handshake
  succeeds (the probe is unsigned).
- Invalid signatures return `403`; verified batches (JSON array or NDJSON) are
  dispatched by log `source`.

## Endpoint

- `POST /webhooks/vercel-log-drains` - Receives and verifies Vercel log drain deliveries
