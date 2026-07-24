# Akeneo Webhooks - Next.js Example

Minimal example of receiving Akeneo PIM (Events API) webhooks with signature
verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- An Akeneo PIM connection with event subscription enabled and its **secret**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Akeneo connection secret to `.env` as `AKENEO_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Run the test suite

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Akeneo requests to your local server — no account required:

```bash
npx hookdeck-cli listen 3000 akeneo --path /webhooks/akeneo
```

Set the connection's **Request URL** (Connect → Connection settings → Event
subscription) to the tunnel URL the CLI prints, then save a product in the PIM to
trigger a `product.updated` event.

## Endpoint

- `POST /webhooks/akeneo` - Route handler at `app/webhooks/akeneo/route.ts`. All
  event types arrive here; the handler dispatches by `action`.

## How Verification Works

The route reads the **raw** request body with `await request.text()`, recomputes
the HMAC-SHA256 of `timestamp + "." + rawBody` using the connection secret,
compares it timing-safely against `x-akeneo-request-signature`, and rejects stale
requests (5-minute window). Payloads are batched as an `events` array.
