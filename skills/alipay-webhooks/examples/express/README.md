# Alipay Webhooks - Express Example

Minimal example of receiving Alipay (Antom / Alipay+) webhooks with RSA256
signature verification and a **signed acknowledgement response**.

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
npm start
```

Server runs on http://localhost:3000 — webhook endpoint `POST /webhooks/alipay`.

## Test locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment,
then complete the payment in the Antom sandbox cashier to trigger a real
`notifyPayment` notification.

## Run the tests

```bash
npm test
```

The tests generate real RSA256 signatures (one key pair stands in for Antom, one
for the merchant), and assert that the ack response is correctly signed with the
merchant key.

## How it works

1. `express.raw()` captures the exact raw body — the signature covers those bytes.
2. `Signature`, `Client-Id`, and `Request-Time` headers are parsed; the two-line
   content `POST /webhooks/alipay\n<Client-Id>.<Request-Time>.<body>` is verified
   with Antom's public key (SHA256withRSA, base64URL signature).
3. On success the handler branches on `notifyType` and returns a **signed** 200
   `SUCCESS` ack so Antom stops retrying.

See [../../references/verification.md](../../references/verification.md) for details.
