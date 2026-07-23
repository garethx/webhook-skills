# Nylas Webhooks - Express Example

Minimal example of receiving Nylas webhooks with `x-nylas-signature` verification, the
challenge handshake, and gzip handling.

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
   cp .env.example .env
   ```

3. Add your Nylas `webhook_secret` to `.env` as `NYLAS_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

- `GET  /webhooks/nylas` — challenge handshake (echoes `?challenge=`)
- `POST /webhooks/nylas` — receives and verifies notifications

## Test

### Run the unit tests

```bash
npm test
```

The tests generate valid `x-nylas-signature` values (hex HMAC-SHA256 of the raw body),
including a gzip case, so no live traffic is needed.

### Receive live webhooks locally

```bash
npx hookdeck-cli listen 3000 nylas --path /webhooks/nylas
```

Point your Nylas webhook URL at the Hookdeck URL it prints, then trigger events (send an
email to a connected grant, create a calendar event). Note that the challenge handshake
runs when the webhook is first created.

## How Verification Works

Nylas signs the **raw request body** with HMAC-SHA256 keyed on your `webhook_secret` and
sends the hex digest in `x-nylas-signature`. This example verifies the raw bytes **before**
parsing, and — when `Content-Encoding: gzip` is set — verifies the **compressed** bytes and
decompresses only after the check passes. See
[../../references/verification.md](../../references/verification.md) for details.
