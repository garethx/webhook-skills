# Synctera Webhooks - Express Example

Minimal example of receiving Synctera webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Synctera webhook signing secret from `POST /v0/webhook_secrets` (this is **not** your API key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Synctera signing secret to `.env` as `SYNCTERA_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook endpoint at
`POST /webhooks/synctera`.

## Test

Run the test suite (generates real Synctera signatures):

```bash
npm test
```

## Receive Real Webhooks Locally

Tunnel Synctera deliveries to your local server with the Hookdeck CLI (no account
required):

```bash
npx hookdeck-cli listen 3000 synctera --path /webhooks/synctera
```

Register the URL Hookdeck prints as your webhook `url` via `POST /v0/webhooks`,
then fire a test event with `POST /v0/webhooks/trigger`.

## How Verification Works

- Headers: `Synctera-Signature` (hex HMAC) and `Request-Timestamp` (POSIX seconds)
- Signed string: `` `${Request-Timestamp}.${raw_body}` ``
- Algorithm: HMAC-SHA256, hex-encoded
- The raw request body is used (via `express.raw`) — never the parsed JSON
- Stale timestamps (>5 min) are rejected for replay protection
- During secret rotation, the header may carry two `.`-delimited signatures; the
  handler accepts the body if it matches either

See [../../references/verification.md](../../references/verification.md) for details.
