# Solidgate Webhooks - Express Example

Minimal example of receiving Solidgate webhooks with signature verification.

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
   cp .env.example .env
   ```

3. Add your Solidgate webhook public and secret keys to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook endpoint at
`POST /webhooks/solidgate`.

## Test

Run the test suite (generates real Solidgate signatures and exercises the endpoint):

```bash
npm test
```

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel Solidgate webhooks to your local server — no account
required:

```bash
npx hookdeck-cli listen 3000 solidgate --path /webhooks/solidgate
```

Register the printed tunnel URL as your endpoint in **Hub → Developers → Channels →
Webhooks**.

## How Verification Works

Solidgate sends two headers: `merchant` (your `wh_pk_` public key) and `signature`.
The signature is `base64( hex( HMAC-SHA512(secretKey, publicKey + rawBody + publicKey) ) )`.
The handler verifies against the **raw** body before parsing JSON. See
[../../references/verification.md](../../references/verification.md) for details.
