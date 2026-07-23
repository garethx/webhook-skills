# ShipBob Webhooks - Express Example

Minimal example of receiving ShipBob webhooks with signature verification using the [standardwebhooks](https://www.npmjs.com/package/standardwebhooks) package (ShipBob uses the Standard Webhooks scheme).

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
npm start
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

ShipBob sends the event topic in the `x-webhook-topic` header (e.g. `order.shipped`)
and signs the request with the `webhook-id`, `webhook-timestamp`, and
`webhook-signature` headers.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 shipbob --path /webhooks/shipbob
```

Register the URL it prints as your subscription URL in ShipBob.

## Manual Testing

Send a sample payload from the ShipBob Dashboard:

1. Open your webhook subscription in the ShipBob Dashboard
2. Click **Send example**
3. Choose a topic and send it to your endpoint
