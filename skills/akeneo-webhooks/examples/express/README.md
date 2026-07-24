# Akeneo Webhooks - Express Example

Minimal example of receiving Akeneo PIM (Events API) webhooks with signature verification.

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
npm start
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

- `POST /webhooks/akeneo` - Receives and verifies Akeneo webhook events (all event
  types arrive here; the handler dispatches by `action`)

## How Verification Works

Akeneo sends two headers:

- `x-akeneo-request-signature` - hex HMAC-SHA256 of `timestamp + "." + rawBody`
- `x-akeneo-request-timestamp` - Unix seconds

The handler recomputes the HMAC over the **raw** body using the connection secret,
compares it timing-safely, and rejects stale requests (5-minute window). Payloads
are batched as an `events` array — up to 10 events per request.
