# Ascend Webhooks - Express Example

Minimal example of receiving Ascend webhooks with signature verification using
Express and Node.js's built-in `crypto` (there is no official Ascend SDK).

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
   cp .env.example .env
   ```

3. Add your Ascend webhook signing secret to `.env`:
   ```bash
   ASCEND_WEBHOOK_SECRET=your_ascend_webhook_secret
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and the webhook endpoint is
`POST http://localhost:3000/webhooks/ascend`.

## Test

Run the unit tests (they generate real Ascend signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Ascend deliveries to your local server (no
install, no account required):

```bash
npx hookdeck-cli listen 3000 ascend --path /webhooks/ascend
```

The CLI prints a public URL — give it to Ascend support as your temporary
endpoint, then inspect and replay requests from the Hookdeck web UI.

## How It Works

1. `express.raw()` captures the **raw** request body — required because the
   signature is computed over the exact bytes Ascend sent.
2. `verifyAscendSignature()` parses `X-Ascend-Signature` (`t=...,v1=...`),
   recomputes `HMAC-SHA256("<timestamp>:<rawBody>", secret)`, and does a
   constant-time compare.
3. On success the body is parsed and dispatched on `event.type`; the handler
   returns `200`. On failure it returns `400`.
