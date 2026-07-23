# Commerce Layer Webhooks - Next.js Example

Minimal example of receiving Commerce Layer webhooks with signature verification using the
Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your webhook `shared_secret` to `.env.local` as `COMMERCELAYER_SHARED_SECRET`.

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/commercelayer

## Test

Run the tests (they generate real signatures and exercise the route handler):

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
  (see `app/webhooks/commercelayer/route.ts`)

## How verification works

Commerce Layer sends `X-CommerceLayer-Signature` = base64 HMAC-SHA256 of the **raw** body,
keyed with the webhook's `shared_secret`. The handler reads `await request.text()` to get
the raw body and verifies it before parsing. See
[../../references/verification.md](../../references/verification.md).
