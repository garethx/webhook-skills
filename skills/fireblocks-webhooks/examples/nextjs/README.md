# Fireblocks Webhooks - Next.js Example

Minimal example of receiving Fireblocks **Webhooks v2** in a Next.js App Router route handler with signature verification (detached JWS / RS512 / JWKS).

## Prerequisites

- Node.js 18+
- A Fireblocks workspace (Sandbox for testing). No signing secret needed — verification uses Fireblocks' public JWKS keys.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `FIREBLOCKS_WEBHOOK_ENV` to match your workspace region (`production`, `eu`, `eu2`, or `sandbox`).

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/fireblocks` on http://localhost:3000.

## How It Works

- The route handler reads the **raw body** via `request.arrayBuffer()` — required because Fireblocks signs the raw bytes.
- `lib/verify.ts` reconstructs the detached JWS (`header..signature` → `header.<raw body base64url>.signature`) and verifies it against the regional JWKS with the `jose` library, pinned to `RS512`.
- `export const runtime = 'nodejs'` ensures the Node.js runtime (needed for verification and `Buffer`).
- The handler dispatches on `event.eventType` and returns `200` to acknowledge.

## Test

```bash
npm test
```

The tests generate a real RSA key pair, inject the public key as a local JWKS via `setJWKS`, and sign detached RS512 JWS signatures the same way Fireblocks does — covering valid, invalid, tampered, wrong-key, and missing-signature cases.

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 fireblocks --path /webhooks/fireblocks
```

Register the printed public URL (with the `/webhooks/fireblocks` path) as your webhook endpoint in the Fireblocks Console → Developer Center → Webhooks (v2).
