# Alipay Webhooks - Next.js Example

Minimal example of receiving Alipay (Antom / Alipay+) webhooks in a Next.js App
Router route handler, with RSA256 signature verification and a **signed
acknowledgement response**.

## Prerequisites

- Node.js 18+
- An Antom / Alipay+ account with a Client ID, your merchant private key, and
  the Antom/Alipay+ public key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`:
   - `ALIPAY_CLIENT_ID` — your Client ID
   - `ALIPAY_PUBLIC_KEY` — Antom/Alipay+ public key (verifies inbound notifications)
   - `ALIPAY_MERCHANT_PRIVATE_KEY` — your private key (signs the ack response)

   Store PEM values on one line with literal `\n` between lines.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/alipay` (handled by
`app/webhooks/alipay/route.ts`). It runs on the Node.js runtime because RSA
verification needs Node's `crypto` module.

## Test locally

```bash
npx hookdeck-cli listen 3000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment.

## Run the tests

```bash
npm test
```

The tests (Vitest) generate real RSA256 signatures and assert the ack response
is correctly signed with the merchant key.

## How it works

1. `await req.text()` reads the **raw** body — the signature covers those exact bytes.
2. The `Signature` / `Client-Id` / `Request-Time` headers are parsed; the
   two-line content is verified with Antom's public key (SHA256withRSA, base64URL).
3. On success the handler branches on `notifyType` and returns a **signed** 200
   `SUCCESS` ack so Antom stops retrying.

See [../../references/verification.md](../../references/verification.md) for details.
