# Courier Webhooks - Express Example

Minimal example of receiving Courier outbound webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Courier account with a webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Courier webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Courier webhooks to your local server (no account or
install required):

```bash
npx hookdeck-cli listen 3000 courier --path /webhooks/courier
```

Then set the printed URL as your webhook endpoint in the Courier dashboard
(**Settings → General → + Outbound Webhook**) and trigger an event — for example, send a
test notification so a `message:updated` event fires.

## How It Works

- Uses `express.raw()` so the **raw body** is available for signature verification.
- Verifies the `courier-signature` header (`t=<timestamp>,signature=<hex>`) by recomputing
  HMAC-SHA256 over `<timestamp>.<rawBody>` and comparing in constant time.
- Rejects invalid or stale signatures with `400`, and acknowledges valid events with `200`.

## Endpoint

- `POST /webhooks/courier` - Receives and verifies Courier webhook events
- `GET /health` - Health check
