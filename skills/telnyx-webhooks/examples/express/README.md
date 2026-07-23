# Telnyx Webhooks - Express Example

Minimal Express example for receiving Telnyx webhooks with **Ed25519** signature verification.

## Why manual verification?

Telnyx signs every webhook with an **Ed25519** signature over `${telnyx-timestamp}|${raw_body}`,
using two headers: `telnyx-signature-ed25519` (base64) and `telnyx-timestamp` (unix seconds).

The pinned Telnyx Node SDK (`telnyx@7`) exposes `client.webhooks.unwrap()`, but that method is
wired to the [Standard Webhooks](https://www.standardwebhooks.com/) library, which expects
`webhook-id` / `webhook-signature` / `webhook-timestamp` headers — **not** Telnyx's real
Ed25519 scheme — so it rejects genuine Telnyx webhooks. This example verifies the signature
directly with [`tweetnacl`](https://www.npmjs.com/package/tweetnacl), which matches Telnyx's
actual signing exactly. See [../../references/verification.md](../../references/verification.md).

## Prerequisites

- Node.js 18+
- Telnyx account with the messaging profile / app configured to send **Webhook API v2** (signed) events
- Your account **Public Key** (base64) from Mission Control → Account Settings → Keys & Credentials → Public Key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Telnyx account **Public Key** (base64) to `.env`:
   ```bash
   TELNYX_PUBLIC_KEY=eu2zvPjhY6odxV34Z/EsRiERvTodkev4Fq0SlK90Izg=
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Test

```bash
npm test
```

The test suite generates a real Ed25519 keypair and exercises:

- Valid `message.sent` signature → 200
- Missing signature headers → 400
- Invalid signature → 400
- Body tampering after signing → 400
- Stale timestamp outside the 5-minute tolerance → 400
- All common event types (`message.received`, `message.sent`, `message.finalized`)

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/telnyx
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 telnyx --path /webhooks/telnyx
```

Paste the public URL into Mission Control → your messaging profile → Outbound / Inbound Webhook URL,
and set the Webhook API version to **v2 (signed)**.
