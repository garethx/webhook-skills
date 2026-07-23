# ShipStation Webhooks - Next.js Example

Minimal example of receiving ShipStation V1 webhooks with the Next.js App Router.

ShipStation V1 sends **thin payloads** (`resource_url` + `resource_type`) and has **no signature**.
This example (1) validates an unguessable secret token from the `?token=` query string (timing-safe)
and (2) fetches `resource_url` with HTTP Basic auth to get the real data. The verification helpers
live in `app/webhooks/shipstation/verify.ts` so they can be unit-tested directly.

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
- A ShipStation account with API key/secret (Settings → Account → API Settings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `SHIPSTATION_WEBHOOK_SECRET` (a random token, e.g. `openssl rand -hex 32`) and your
   `SHIPSTATION_API_KEY` / `SHIPSTATION_API_SECRET` in `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Subscribe

Register your endpoint (including the secret token) with ShipStation:

```bash
curl -X POST https://ssapi.shipstation.com/webhooks/subscribe \
  -u "$SHIPSTATION_API_KEY:$SHIPSTATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"target_url":"https://your-app.com/webhooks/shipstation?token=YOUR_SECRET","event":"SHIP_NOTIFY"}'
```

## Test

### Using the Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 shipstation --path /webhooks/shipstation
```

Use the generated HTTPS URL (append `?token=YOUR_SECRET`) as the `target_url` when subscribing.

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/shipstation?token=...` - Validates the token, fetches `resource_url`, dispatches on
  `resource_type` (`ORDER_NOTIFY`, `ITEM_ORDER_NOTIFY`, `SHIP_NOTIFY`, `ITEM_SHIP_NOTIFY`,
  `FULFILLMENT_SHIPPED`, `FULFILLMENT_REJECTED`)
