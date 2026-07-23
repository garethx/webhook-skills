# Polar Webhooks - Next.js Example

Minimal example of receiving Polar webhooks with Standard Webhooks signature verification using the official `@polar-sh/sdk`, in a Next.js App Router route handler.

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
npm run dev
```

The webhook endpoint is `POST /webhooks/polar` (see `app/webhooks/polar/route.ts`), served at http://localhost:3000/webhooks/polar.

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

App Router route handlers give you the raw body via `await request.text()`. The handler builds a
Standard Webhooks headers object (`webhook-id`, `webhook-timestamp`, `webhook-signature`) and
calls `validateEvent(body, headers, process.env.POLAR_WEBHOOK_SECRET)` from
`@polar-sh/sdk/webhooks`. It throws `WebhookVerificationError` on a bad signature (→ 400). A valid
signature whose payload this SDK version can't parse is acknowledged with a 2xx so Polar doesn't
retry and auto-disable the endpoint.

> **Important:** Do not add a `body` parser or middleware that consumes the request stream before
> the handler — verification needs the exact raw bytes. App Router hands you the untouched body.

See [../../references/verification.md](../../references/verification.md) for details.
