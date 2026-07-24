# FastSpring Webhooks - Express Example

Minimal example of receiving FastSpring webhooks with signature verification.

## Prerequisites

- Node.js 18+
- FastSpring account with a webhook configured and an HMAC SHA256 Secret set

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your FastSpring HMAC SHA256 Secret to `.env` as `FASTSPRING_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real `X-FS-Signature` values):

```bash
npm test
```

### Receive webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 fastspring --path /webhooks/fastspring
```

Use the tunnel URL as your webhook endpoint in the FastSpring dashboard
(**Developer Tools → Webhooks → Configuration**).

## Endpoint

- `POST /webhooks/fastspring` - Verifies the `X-FS-Signature` header, then iterates
  the batched `events` array and dispatches on each `event.type`.
- `GET /health` - Health check.

## How Verification Works

FastSpring signs the exact raw request body with HMAC-SHA256 keyed on your HMAC
SHA256 Secret, base64-encodes it, and sends it in `X-FS-Signature`. The handler
uses `express.raw()` so the raw body is available for verification — verify **once**
against the whole body, then parse and iterate `events`.
