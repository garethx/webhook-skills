# Neon Webhooks - Next.js Example

Minimal example of receiving Neon Auth webhooks with Ed25519 / detached JWS signature
verification in a Next.js App Router route handler.

## Prerequisites

- Node.js 18+ (built-in `fetch` and `node:crypto` Ed25519 support)
- A Neon project with Neon Auth enabled

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `NEON_AUTH_URL` in `.env` to your Neon Auth domain. The JWKS (public keys) are
   fetched from `${NEON_AUTH_URL}/.well-known/jwks.json` — there is **no signing secret**.

## Run

```bash
npm run dev
```

The webhook endpoint is served at `POST /webhooks/neon`
(http://localhost:3000/webhooks/neon).

## How Verification Works

The route handler in `app/webhooks/neon/route.ts`:

1. Reads the raw request body with `request.text()` (the signature covers exact bytes).
2. Parses the detached JWS from `X-Neon-Signature` (`header..signature`).
3. Fetches the public key from the JWKS by `X-Neon-Signature-Kid` (cached by `kid`).
4. Reconstructs the signing input with **double base64url** encoding and verifies the
   Ed25519 signature.
5. Enforces a 5-minute timestamp tolerance against `X-Neon-Timestamp` (milliseconds).

See [../../references/verification.md](../../references/verification.md) for details.

## Test

Run the included tests (they generate a real Ed25519 keypair, expose it as a JWKS, and
sign requests exactly as Neon does):

```bash
npm test
```

## Local Development

Receive live webhooks on your machine with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 neon --path /webhooks/neon
```

Point a Neon Auth **development branch's** webhook URL at the tunnel URL the CLI prints.
