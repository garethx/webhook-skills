# Nylas Webhooks - Next.js Example

Minimal example of receiving Nylas webhooks in a Next.js App Router route handler, with
`x-nylas-signature` verification, the challenge handshake, and gzip handling.

## Prerequisites

- Node.js 18+
- A Nylas application with a webhook destination (see [../../references/setup.md](../../references/setup.md))
- The destination's `webhook_secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Nylas `webhook_secret` to `.env.local` as `NYLAS_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

The route handler lives at `app/webhooks/nylas/route.ts` and serves:

- `GET  /webhooks/nylas` — challenge handshake (echoes `?challenge=`)
- `POST /webhooks/nylas` — receives and verifies notifications

Server runs on http://localhost:3000

## Test

### Run the unit tests

```bash
npm test
```

The tests call the exported `GET`/`POST` handlers with `Request` objects and generate
valid `x-nylas-signature` values (hex HMAC-SHA256 of the raw body), including a gzip case.

### Receive live webhooks locally

```bash
npx hookdeck-cli listen 3000 nylas --path /webhooks/nylas
```

Point your Nylas webhook URL at the Hookdeck URL it prints, then trigger events.

## How Verification Works

The handler reads the raw request bytes with `request.arrayBuffer()` and verifies the
`x-nylas-signature` (hex HMAC-SHA256 of the raw body) **before** parsing. When
`Content-Encoding: gzip` is set, it verifies the **compressed** bytes and decompresses
only after the check passes. See
[../../references/verification.md](../../references/verification.md) for details.
