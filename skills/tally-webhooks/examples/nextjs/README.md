# Tally Webhooks - Next.js Example

Minimal example of receiving Tally webhooks with `Tally-Signature` verification, using the Next.js
App Router.

## Prerequisites

- Node.js 18+
- A Tally form with a webhook configured (optionally with a signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Tally webhook signing secret to `.env` as `TALLY_SIGNING_SECRET`.
   (Signing is optional in Tally — if you leave it unset, the handler processes
   unsigned requests and logs a warning. Set it for production.)

## Run

```bash
npm run dev
```

The route handler lives at `app/webhooks/tally/route.ts` and accepts webhooks at
`POST /webhooks/tally` on http://localhost:3000.

## Test

```bash
npm test
```

Tests generate real HMAC-SHA256 signatures and exercise both the signed and unsigned paths through
the actual route handler.

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 tally --path /webhooks/tally
```

Put the tunnel URL into your form's **Integrations → Webhooks** configuration, then submit the
form to trigger a `FORM_RESPONSE` event.

## How verification works

Tally signs the **raw JSON body** with HMAC-SHA256 keyed on the signing secret and sends the
base64 digest in the `Tally-Signature` header. The handler reads the raw body with
`request.text()` before parsing, computes `base64(HMAC-SHA256(secret, rawBody))`, and compares
timing-safely. See [../../references/verification.md](../../references/verification.md) for details.
