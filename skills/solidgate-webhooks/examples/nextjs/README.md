# Solidgate Webhooks - Next.js Example

Minimal example of receiving Solidgate webhooks in a Next.js App Router route
handler with signature verification.

## Prerequisites

- Node.js 18+
- Solidgate webhook keys (`wh_pk_` / `wh_sk_`) from Hub → Developers

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Solidgate webhook public and secret keys.

## Run

```bash
npm run dev
```

The webhook endpoint is at `POST /webhooks/solidgate`
(`app/webhooks/solidgate/route.ts`).

## Test

```bash
npm test
```

## Receive Real Webhooks Locally

```bash
npx hookdeck-cli listen 3000 solidgate --path /webhooks/solidgate
```

Register the printed tunnel URL as your endpoint in **Hub → Developers → Channels →
Webhooks**.

## How Verification Works

Solidgate sends `merchant` (your `wh_pk_` public key) and `signature` headers. The
route reads the **raw** request body with `request.text()` before parsing, then
verifies `base64( hex( HMAC-SHA512(secretKey, publicKey + rawBody + publicKey) ) )`.
See [../../references/verification.md](../../references/verification.md) for details.
