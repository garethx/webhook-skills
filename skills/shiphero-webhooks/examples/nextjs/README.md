# ShipHero Webhooks - Next.js Example

Minimal example of receiving ShipHero webhooks with signature verification using the
Next.js App Router.

## Prerequisites

- Node.js 18+
- A ShipHero webhook registered via `webhook_create` (gives you the `shared_signature_secret`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your `shared_signature_secret` to `.env.local` as `SHIPHERO_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real ShipHero signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 shiphero --path /webhooks/shiphero
```

Register the tunnel URL as the webhook `url` via the `webhook_create` mutation.

## Endpoint

- `POST /webhooks/shiphero` - Receives and verifies ShipHero webhook events

The route reads the **raw body** with `request.text()` (required for HMAC verification),
recomputes `base64(HMAC-SHA256(rawBody, secret))`, compares it timing-safe against the
`x-shiphero-hmac-sha256` header, then dispatches on the payload's `webhook_type` field.
