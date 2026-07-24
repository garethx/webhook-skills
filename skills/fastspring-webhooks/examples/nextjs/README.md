# FastSpring Webhooks - Next.js Example

Minimal example of receiving FastSpring webhooks with signature verification using
the Next.js App Router.

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
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/fastspring

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

## How Verification Works

FastSpring signs the exact raw request body with HMAC-SHA256 keyed on your HMAC
SHA256 Secret, base64-encodes it, and sends it in `X-FS-Signature`. The route reads
the raw body with `await request.text()` before parsing — verify **once** against
the whole body, then parse and iterate `events`.
