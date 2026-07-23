# Paystack Webhooks - Next.js Example

Minimal example of receiving Paystack webhooks in a Next.js App Router route
handler. Paystack's SDKs have no verification helper, so the signature is
verified **manually** with Node's `crypto` (HMAC-SHA512, hex, timing-safe
compare).

## Prerequisites

- Node.js 18+
- A Paystack account (for your secret key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Paystack secret key to `.env` as `PAYSTACK_SECRET_KEY`
   (`sk_test_…` from Dashboard → Settings → API Keys & Webhooks).

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/paystack` (served at
http://localhost:3000/webhooks/paystack).

## Test

Run the tests (they generate real HMAC-SHA512 signatures and exercise the route
handler):

```bash
npm test
```

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel Paystack webhooks to your local server (no
install, no account required):

```bash
npx hookdeck-cli listen 3000 paystack --path /webhooks/paystack
```

Set your Paystack dashboard Webhook URL (Settings → API Keys & Webhooks) to the
tunnel URL the CLI prints, then trigger a test-mode transaction to see events
arrive.

## How It Works

- The route reads the **raw body** with `await request.text()` before parsing —
  parsing JSON first would break the HMAC.
- `verifyPaystackWebhook` recomputes HMAC-SHA512 (hex) over the raw body with
  your secret key and compares it to the `x-paystack-signature` header using a
  timing-safe comparison.
- An invalid or missing signature returns **400**; verified events return
  **200**.
- The event type comes from the JSON body's `event` field.
