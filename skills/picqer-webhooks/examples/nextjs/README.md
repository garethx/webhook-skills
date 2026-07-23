# Picqer Webhooks - Next.js Example

Minimal example of receiving Picqer webhooks with signature verification using
the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Picqer API key and a hook created with a `secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Picqer hook `secret` to `.env` as `PICQER_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/picqer

## Test

### Run the test suite

```bash
npm test
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 picqer --path /webhooks/picqer
```

Use the public URL the CLI prints as the hook `address` when you create the hook
(see the [Express example README](../express/README.md) for the `POST /hooks`
call, or [references/setup.md](../../references/setup.md)).

## Endpoint

- `POST /webhooks/picqer` - Receives and verifies Picqer webhook events

## Route

The handler lives at `app/webhooks/picqer/route.ts`. It reads the raw request
body with `await request.text()` so the HMAC-SHA256 signature can be verified
before the JSON is parsed.
