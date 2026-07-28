# Ascend Webhooks - Next.js Example

Minimal example of receiving Ascend webhooks with signature verification using
the Next.js App Router and Node's built-in `crypto` (there is no official Ascend
SDK).

## Prerequisites

- Node.js 18+
- An Ascend webhook signing secret (email `developers@useascend.com`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Ascend webhook signing secret:
   ```bash
   ASCEND_WEBHOOK_SECRET=your_ascend_webhook_secret
   ```

## Run

```bash
npm run dev
```

The webhook route is `POST http://localhost:3000/webhooks/ascend`
(handled by `app/webhooks/ascend/route.ts`).

## Test

Run the unit tests (they generate real Ascend signatures and call the route):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Ascend deliveries to your local server (no
install, no account required):

```bash
npx hookdeck-cli listen 3000 ascend --path /webhooks/ascend
```

## How It Works

1. `await request.text()` reads the **raw** body — required because the
   signature is computed over the exact bytes Ascend sent.
2. `verifyAscendSignature()` parses `X-Ascend-Signature` (`t=...,v1=...`),
   recomputes `HMAC-SHA256("<timestamp>:<rawBody>", secret)`, and does a
   constant-time compare.
3. On success the body is parsed and dispatched on `event.type`; the route
   returns `200`. On failure it returns `400`.

> Route Handlers do not buffer or re-parse the body before your code runs, so
> `request.text()` gives you the exact bytes needed for verification.
