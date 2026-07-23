# Circle Webhooks — Next.js Example

Next.js App Router route handler that receives Circle Payments Network (CPN)
webhooks and verifies the **ECDSA_SHA_256** signature against Circle's public key.

## Prerequisites

- Node.js **18+**
- A Circle account with a notification subscription — see
  [../../references/setup.md](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CIRCLE_API_KEY` in `.env` (used to fetch the notification public key by
   its keyId). Set `CIRCLE_API_BASE_URL` to `https://api-sandbox.circle.com`
   when testing against sandbox.

## Run

```bash
npm run dev
```

The webhook route is served at `POST /webhooks/circle` (and `HEAD /webhooks/circle`
for Circle's endpoint validation) on http://localhost:3000.

## Test

```bash
npm test
```

The test generates an ECDSA P-256 key pair in memory, injects it into the public
key cache, signs a payload with the matching private key, and asserts the route's
responses.

For real end-to-end testing, expose your local server and create a subscription
pointing at the tunnel URL:

```bash
npm run dev
npx hookdeck-cli listen 3000 circle --path /webhooks/circle
```

## How Verification Works Here

1. The route reads the request body as raw bytes (`request.arrayBuffer()`).
2. The `X-Circle-Signature` (base64) and `X-Circle-Key-Id` (UUID) headers are read.
3. The public key for that keyId is fetched from
   `GET /v2/cpn/notifications/publicKey/{keyId}` and cached (base64 DER/SPKI).
4. The signature is verified over the **raw body** with ECDSA using SHA-256.

See [../../references/verification.md](../../references/verification.md) for the
full algorithm and common gotchas.
