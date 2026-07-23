# Vercel Log Drains - Express Example

Minimal example of receiving Vercel Log Drains deliveries with `x-vercel-signature`
verification (HMAC-SHA1) using Express.

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
   cp .env.example .env
   ```

3. Add your drain signature secret (`VERCEL_LOG_DRAIN_SECRET`) and verification
   token (`VERCEL_VERIFY`) to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

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

Point your Vercel log drain at the Hookdeck URL, then deploy or make requests to
your app to generate logs.

## How It Works

- The `x-vercel-verify` response header is echoed so the drain create/test
  handshake succeeds (the probe request is unsigned).
- Signed deliveries are verified with HMAC-SHA1 over the **raw body**; invalid
  signatures return `403`.
- Verified batches are parsed as a JSON array or NDJSON and dispatched by log
  `source` (`lambda`, `edge`, `build`, `static`, `external`, `firewall`,
  `redirect`).

## Endpoint

- `POST /webhooks/vercel-log-drains` - Receives and verifies Vercel log drain deliveries
- `GET /health` - Health check
