# Circle Webhooks — Express Example

Minimal Express server that receives Circle Payments Network (CPN) webhooks and
verifies the **ECDSA_SHA_256** signature against Circle's public key.

## Prerequisites

- Node.js **18+** (uses the built-in global `fetch`)
- A Circle account with a notification subscription — see
  [../../references/setup.md](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CIRCLE_API_KEY` in `.env` (used to fetch the notification public key by
   its keyId). Set `CIRCLE_API_BASE_URL` to `https://api-sandbox.circle.com`
   when testing against sandbox.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and exposes:

- `POST /webhooks/circle` — Webhook receiver
- `HEAD /webhooks/circle` — Endpoint validation (Circle sends a HEAD request when a subscription is created/updated)
- `GET  /health` — Liveness check

## Test

Run the bundled test suite — it generates an ECDSA P-256 key pair in memory,
injects it into the public key cache, signs a payload with the matching private
key, and exercises the full request/response cycle:

```bash
npm test
```

For real end-to-end testing, expose your local server and create a subscription
pointing at the tunnel URL:

```bash
# In one terminal
npm start
# In another, expose your local server (no account required)
npx hookdeck-cli listen 3000 circle --path /webhooks/circle
```

Then create a notification subscription via the Circle API (or console) with the
printed forwarding URL as the `endpoint`.

## How Verification Works Here

1. The route reads `req.body` as a raw `Buffer` (via `express.raw()`).
2. The `X-Circle-Signature` (base64) and `X-Circle-Key-Id` (UUID) headers are read.
3. The public key for that keyId is fetched from
   `GET /v2/cpn/notifications/publicKey/{keyId}` and cached (base64 DER/SPKI).
4. The signature is verified over the **raw body** with ECDSA using SHA-256.

See [../../references/verification.md](../../references/verification.md) for the
full algorithm and common gotchas.
