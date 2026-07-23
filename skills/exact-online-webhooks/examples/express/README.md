# Exact Online Webhooks - Express Example

Minimal example of receiving Exact Online webhooks with `HashCode` signature
verification.

## Prerequisites

- Node.js 18+
- An Exact Online OAuth app with a **Webhook secret** (from the App Center)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Exact App Center **Webhook secret** to `.env` as `EXACT_WEBHOOK_SECRET`.
   (This is the Webhook secret, not the OAuth client secret.)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real `HashCode` signatures):

```bash
npm test
```

## Receive real webhooks locally

Start a tunnel (no account required) and point it at your local handler:

```bash
npx hookdeck-cli listen 3000 exact-online --path /webhooks/exact-online
```

Register the printed public URL as the `CallbackURL` when you create a
subscription:

```http
POST https://start.exactonline.nl/api/v1/{division}/webhooks/WebhookSubscriptions
Authorization: Bearer {access_token}
Content-Type: application/json

{ "Topic": "Accounts", "CallbackURL": "https://<your-tunnel-url>/webhooks/exact-online" }
```

Then change a subscribed entity in Exact Online and watch the delivery arrive.

## How It Works

- Exact POSTs `{"Content":{…},"HashCode":"<hex>"}`.
- The handler reads the **raw body**, computes HMAC-SHA256 over the raw `Content`
  JSON keyed with `EXACT_WEBHOOK_SECRET`, hex-encodes and uppercases it, and
  compares to `HashCode` (401 on mismatch).
- The payload is thin, so fetch the full record from the REST API using
  `Content.Key` + `Content.Division`, then return **200** quickly.

See [../../references/verification.md](../../references/verification.md) for details.
