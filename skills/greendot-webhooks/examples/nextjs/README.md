# Green Dot Webhooks - Next.js Example

Minimal example of receiving Green Dot Embedded Finance (BaaS) webhooks in a
Next.js App Router route handler with OAuth Bearer token authentication and
optional `x-gd-signature` verification.

## Prerequisites

- Node.js 18+
- A Green Dot program (endpoint registered by your Green Dot rep) with the OAuth
  token secret, and optionally the `x-gd-signature` signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `GREENDOT_WEBHOOK_TOKEN_SECRET` (and optionally `GREENDOT_SIGNING_KEY`)
   in `.env.local`.

## Run

```bash
npm run dev
```

The webhook route is `POST /webhooks/greendot`
(`app/webhooks/greendot/route.ts`), served on http://localhost:3000.

## How It Works

1. **Authenticate** the OAuth client_credentials Bearer token and require the
   `post:webhook` scope (returns `401` otherwise).
2. **Verify** the optional `x-gd-signature` over the raw body (`await req.text()`)
   when `GREENDOT_SIGNING_KEY` is set (returns `400` on mismatch).
3. **Parse** the JSON body and dispatch on `eventType`.
4. **Acknowledge** with `200`, echoing the `x-GD-RequestId` header and returning
   a `responseDetails` body.

> This example validates an HS256 token with a shared secret so it is
> self-contained. In production, validate the token against your authorization
> server (JWKS / RS256 or introspection). See
> [../../references/verification.md](../../references/verification.md).

## Test

```bash
npm test
```

The tests generate real tokens and signatures using the same algorithms as the
route handler.

## Local Development

Tunnel Green Dot deliveries to your local server with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 greendot --path /webhooks/greendot
```

No account required — the CLI creates a guest account and provides a local
tunnel plus a web UI for inspecting requests.
