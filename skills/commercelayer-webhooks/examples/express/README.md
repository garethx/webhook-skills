# Commerce Layer Webhooks - Express Example

Minimal example of receiving Commerce Layer webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Commerce Layer webhook with its `shared_secret` (returned when you create the webhook
  via `POST /api/webhooks` — see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook `shared_secret` to `.env` as `COMMERCELAYER_SHARED_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit/integration tests (they generate real signatures):

```bash
npm test
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 commercelayer --path /webhooks/commercelayer
```

No account required — the CLI creates a guest account and a public tunnel. Set the URL it
prints as your webhook's `callback_url`, then trigger an event (e.g. place a test order).

## Endpoint

- `POST /webhooks/commercelayer` — Receives and verifies Commerce Layer webhook events
- `GET /health` — Health check

## How verification works

Commerce Layer sends `X-CommerceLayer-Signature` = base64 HMAC-SHA256 of the **raw** body,
keyed with the webhook's `shared_secret`. The handler uses `express.raw()` so the body is
verified byte-for-byte before it's parsed. See
[../../references/verification.md](../../references/verification.md).
