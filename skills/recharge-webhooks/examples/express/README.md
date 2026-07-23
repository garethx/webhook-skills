# Recharge Webhooks - Express Example

Minimal example of receiving Recharge webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Recharge account with an **API Client Secret** (see below)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Recharge **API Client Secret** to `.env`. Find it in the Recharge Dashboard:
   **Integrations → API Tokens →** click your token (**Edit API Token** page). This is not
   the API access token used to call the API.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real signatures using Recharge's algorithm):

```bash
npm test
```

### Receive live webhooks locally

```bash
npx hookdeck-cli listen 3000 recharge --path /webhooks/recharge
```

Register the printed tunnel URL as the `address` when you create a webhook subscription
(`POST https://api.rechargeapps.com/webhooks`), then trigger events in Recharge or use the
[Test webhooks](https://developer.rechargepayments.com/2021-11/webhooks_endpoints/webhooks_test) API.

## Verification note

The handler verifies the **recommended timestamp-bound scheme** first: the
`X-Recharge-Webhook-Signature` header carries `t=<epoch>,v1=<hex>`, where `v1` is an HMAC-SHA-256
over `<timestamp>.<rawBody>` keyed by the client secret. Deliveries older than 48 hours are rejected.
When that header is absent it falls back to the **legacy** `X-Recharge-Hmac-Sha256` header — which,
despite the name, is a **plain SHA-256** of `clientSecret + rawBody` (secret first), hex-encoded —
**not HMAC**. The route uses `express.raw()` so the exact raw bytes are hashed.

## Endpoint

- `POST /webhooks/recharge` - Receives and verifies Recharge webhook events
- `GET /health` - Health check
