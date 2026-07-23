# Polar Webhooks - Express Example

Minimal example of receiving Polar webhooks with Standard Webhooks signature verification using the official `@polar-sh/sdk`.

## Prerequisites

- Node.js 18+
- A Polar organization with a webhook endpoint and signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Polar webhook signing secret to `.env`:
   ```bash
   POLAR_WEBHOOK_SECRET=your_webhook_signing_secret
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and the webhook endpoint is `POST /webhooks/polar`.

## Test

Run the test suite (generates real Standard Webhooks signatures):

```bash
npm test
```

### Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required) and use the printed URL as your endpoint in the Polar dashboard:

```bash
npx hookdeck-cli listen 3000 polar --path /webhooks/polar
```

Or use Polar's first-party tunnel:

```bash
polar listen http://localhost:3000/
```

## How verification works

The handler uses `express.raw()` so the exact request bytes are available, then calls
`validateEvent(req.body, req.headers, process.env.POLAR_WEBHOOK_SECRET)` from
`@polar-sh/sdk/webhooks`. It verifies the `webhook-id` / `webhook-timestamp` / `webhook-signature`
headers (HMAC-SHA256, base64) and returns the parsed event, throwing `WebhookVerificationError`
on failure. Pass the secret **as-is** — the SDK handles the base64 encoding the spec requires.

See [../../references/verification.md](../../references/verification.md) for details.
