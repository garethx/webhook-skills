# ShipHero Webhooks - Express Example

Minimal example of receiving ShipHero webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A ShipHero webhook registered via `webhook_create` (gives you the `shared_signature_secret`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your `shared_signature_secret` to `.env` as `SHIPHERO_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real ShipHero signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 shiphero --path /webhooks/shiphero
```

Register the tunnel URL as the webhook `url` via the `webhook_create` mutation, then
trigger the matching action in ShipHero (allocate an order, ship it, etc.).

## Endpoint

- `POST /webhooks/shiphero` - Receives and verifies ShipHero webhook events

## How It Works

1. The route reads the **raw body** (`express.raw`) — required for HMAC verification.
2. It recomputes `base64(HMAC-SHA256(rawBody, secret))` and compares it timing-safe
   against the `x-shiphero-hmac-sha256` header.
3. After verifying, it dispatches on the payload's `webhook_type` field (ShipHero has
   no topic header).
4. It replies `200` with `{"code":"200","Status":"Success"}` — ShipHero's expected ack.
