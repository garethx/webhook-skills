# ShipBob Webhooks - Next.js Example

Minimal example of receiving ShipBob webhooks in a Next.js App Router route handler with signature verification using the [standardwebhooks](https://www.npmjs.com/package/standardwebhooks) package (ShipBob uses the Standard Webhooks scheme).

## Prerequisites

- Node.js 18+
- ShipBob account with a webhook subscription and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your ShipBob webhook signing secret to `.env` as `SHIPBOB_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/shipbob
```

The route reads the raw body with `await request.text()` before verifying — never
parse the JSON first. The event topic comes from the `x-webhook-topic` header.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 shipbob --path /webhooks/shipbob
```

Register the URL it prints as your subscription URL in ShipBob.

## Manual Testing

Send a sample payload from the ShipBob Dashboard using the **Send example** button
on your webhook subscription.
