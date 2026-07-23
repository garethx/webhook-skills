# BigCommerce Webhooks - Express Example

Minimal example of receiving BigCommerce webhooks with Standard Webhooks signature verification.

## Prerequisites

- Node.js 18+
- A BigCommerce app with a **client secret** (used to sign/verify webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your BigCommerce app client secret to `.env` as `BIGCOMMERCE_CLIENT_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at
`POST /webhooks/bigcommerce`.

## Receive webhooks locally

BigCommerce requires an HTTPS endpoint on port 443, so use a tunnel for local
development. The Hookdeck CLI runs via `npx` (no install, no account required):

```bash
npx hookdeck-cli listen 3000 bigcommerce --path /webhooks/bigcommerce
```

Then create a webhook pointing at the tunnel URL via the BigCommerce API:

```bash
curl -X POST https://api.bigcommerce.com/stores/{store_hash}/v3/hooks \
  -H "X-Auth-Token: {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "store/order/created",
    "destination": "https://<your-hookdeck-url>/webhooks/bigcommerce",
    "is_active": true
  }'
```

New webhooks can take up to a minute to activate.

## Test

```bash
npm test
```

The tests generate real Standard Webhooks signatures with the `standardwebhooks`
library and assert the handler accepts valid signatures and rejects invalid,
tampered, and expired ones.
