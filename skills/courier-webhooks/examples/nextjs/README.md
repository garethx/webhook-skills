# Courier Webhooks - Next.js Example

Minimal example of receiving Courier outbound webhooks with signature verification using
the Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your Courier webhook signing secret to `.env.local`

## Run

```bash
npm run dev
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
(**Settings → General → + Outbound Webhook**) and trigger an event.

## How It Works

- Reads the **raw body** with `await request.text()` before parsing, so the signature can
  be verified against the exact bytes Courier signed.
- Verifies the `courier-signature` header (`t=<timestamp>,signature=<hex>`) by recomputing
  HMAC-SHA256 over `<timestamp>.<rawBody>` and comparing in constant time.
- Returns `400` for invalid signatures and `200` for valid events.

## Endpoint

- `POST /webhooks/courier` - Receives and verifies Courier webhook events
  (`app/webhooks/courier/route.ts`)
