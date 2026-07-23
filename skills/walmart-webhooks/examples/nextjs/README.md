# Walmart Webhooks - Next.js Example

Minimal example of receiving Walmart Marketplace performance webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Walmart Marketplace webhook secret (from the Performance webhook endpoint setup)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your `WALMART_WEBHOOK_SECRET` to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 walmart --path /webhooks/walmart
```

Register the Hookdeck URL as your Walmart performance webhook endpoint.

## How verification works

The route reads the **raw** request body with `await request.text()`, rebuilds Walmart's canonical string:

```
<METHOD>\n<PATH_AND_QUERY>\n<WM_SEC.TIMESTAMP>\n<SHA256_HEX_OF_RAW_BODY>
```

then compares `base64(HMAC_SHA256(secret, stringToSign))` timing-safe against `WM_SEC.SIGNATURE`, rejects stale timestamps, and only parses JSON after verification.

## Endpoint

- `POST /webhooks/walmart` - Receives and verifies Walmart webhook events
