# Token.io Webhooks - Express Example

Minimal example of receiving Token.io webhooks with Ed25519 signature verification.

## Prerequisites

- Node.js 18+
- A Token.io member with an Ed25519 public key (Dashboard → Settings → Member Information)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your member's Ed25519 **public key** (base64url) to `.env` as
   `TOKEN_WEBHOOK_PUBLIC_KEY`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is
`POST /webhooks/tokenio`.

## How It Works

- The body is read raw (`express.raw`) so the exact bytes Token.io signed are
  preserved for verification.
- `verifyTokenWebhook` imports your base64url public key as an Ed25519 JWK and
  verifies the `token-signature` header against the raw body.
- The event type comes from the `token-event` header — the handler dispatches on it.
- Invalid or missing signatures return `400`; valid deliveries return `200`.

## Test

```bash
npm test
```

The tests generate a real Ed25519 key pair, sign payloads exactly as Token.io
does (Ed25519 over the raw body, base64url), and assert the handler verifies them.

## Local Development

Receive live Token.io deliveries on your machine with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 tokenio --path /webhooks/tokenio
```

Register the printed public URL as the `url` in your `PUT /webhook/config` request.
