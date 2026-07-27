# Utila Webhooks - Next.js Example

Minimal example of receiving Utila webhooks in a Next.js App Router route with
RSA signature verification.

## Prerequisites

- Node.js 18+
- A Utila account with a webhook configured in the Console
  (Vault Settings → Webhooks) and its PEM RSA-4096 **public** key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add Utila's PEM public key to `.env.local` as `UTILA_WEBHOOK_PUBLIC_KEY`.
   There is no shared secret — verification uses only the public key.

## Run

```bash
npm run dev
```

The webhook route is `POST /webhooks/utila` (see
`app/webhooks/utila/route.ts`).

## How It Works

- The route reads the raw bytes with `await request.arrayBuffer()` — the RSA
  signature is computed over the exact raw body, so it must not be parsed to JSON
  first.
- `verifyUtilaSignature()` verifies the base64 `x-utila-signature` header with
  Node's `crypto.verify` (SHA-512 + PSS padding, `RSA_PSS_SALTLEN_AUTO`).
- Invalid or missing signatures return **400**; verified events return **200** so
  Utila stops retrying.

## Test

```bash
npm test
```

The tests generate an RSA key pair and sign payloads with SHA-512 + PSS exactly
the way Utila does, then assert the route accepts valid signatures and rejects
missing, invalid, and tampered ones.

## Local Development

Tunnel live Utila deliveries to your machine with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 utila --path /webhooks/utila
```

Point the Console webhook URL at the tunnel URL the CLI prints. No account
required — the CLI creates a guest account on first run.
