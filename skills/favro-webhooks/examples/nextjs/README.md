# Favro Webhooks - Next.js Example

Minimal example of receiving Favro webhooks in a Next.js App Router route handler
with `X-Favro-Webhook` signature verification.

## Prerequisites

- Node.js 18+
- A Favro webhook with a `secret` and a registered `postToUrl`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `FAVRO_WEBHOOK_SECRET` to the secret you chose at webhook creation, and
   `FAVRO_WEBHOOK_URL` to the exact `postToUrl` you registered. The URL is part
   of the signature, so it must match byte-for-byte.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/favro` (see
`app/webhooks/favro/route.ts`).

## How Verification Works

Favro does **not** use Standard Webhooks. The signature header is
`X-Favro-Webhook` and is computed over `payloadId + webhookUrl` (not the request
body):

```
X-Favro-Webhook = base64( HMAC-SHA1( secret, payloadId + webhookUrl ) )
```

The route reads the raw body only to extract `payloadId`, recomputes the HMAC
with your registered `FAVRO_WEBHOOK_URL`, and compares with a timing-safe
compare. The setup **ping** is signed the same way — the route verifies it and
returns `200` to validate the webhook.

## Test

```bash
npm test
```

## Local Development with Hookdeck CLI

Expose your local server so Favro can reach it (no account required):

```bash
npx hookdeck-cli listen 3000 favro --path /webhooks/favro
```

Register the printed public URL as the `postToUrl`, and set `FAVRO_WEBHOOK_URL`
to that same URL.
