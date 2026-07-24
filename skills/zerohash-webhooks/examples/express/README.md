# Zero Hash Webhooks - Express Example

Minimal example of receiving Zero Hash webhooks with signature verification
using Express. Zero Hash has no webhook SDK, so signatures are verified
**manually** with Node's `crypto` module.

## Prerequisites

- Node.js 18+
- A Zero Hash HMAC webhook shared secret (provisioned by your Zero Hash rep)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Zero Hash **HMAC shared secret** to `.env`:
   ```bash
   ZEROHASH_WEBHOOK_SECRET=your_zero_hash_hmac_shared_secret
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook endpoint at
`POST /webhooks/zerohash`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures for both the
recommended and legacy schemes):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Zero Hash webhooks to your local server (no
account required):

```bash
npx hookdeck-cli listen 3000 zerohash --path /webhooks/zerohash
```

Give the public URL the CLI prints to your Zero Hash rep as your destination URL.

## How It Works

- The route uses `express.raw()` so the **raw body** is available for signature
  verification (parsing JSON first would break the signature).
- `verifyZeroHash()` recomputes the HMAC-SHA256 hex digest. For the recommended
  scheme it signs `payload + timestamp` (from `x-zh-hook-signature` /
  `x-zh-hook-timestamp`) and rejects timestamps outside ±5 minutes; it falls
  back to the legacy `x-zh-hook-signature-256` (payload only) scheme.
- The event type comes from the `x-zh-hook-payload-type` header.
- Invalid, missing, or expired signatures return `400`; verified events return `200`.
