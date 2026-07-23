# Telnyx Webhooks - Next.js Example

Minimal Next.js App Router example for receiving Telnyx webhooks with **Ed25519** signature verification.

## Why manual verification?

Telnyx signs every webhook with an **Ed25519** signature over `${telnyx-timestamp}|${raw_body}`,
using the headers `telnyx-signature-ed25519` (base64) and `telnyx-timestamp` (unix seconds).
The pinned `telnyx@7` SDK's `client.webhooks.unwrap()` is wired to the
[Standard Webhooks](https://www.standardwebhooks.com/) library, which uses different headers and
does not match Telnyx's real scheme — so this example verifies directly with
[`tweetnacl`](https://www.npmjs.com/package/tweetnacl). See
[../../references/verification.md](../../references/verification.md).

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
npm run dev
```

The route is served at http://localhost:3000/webhooks/telnyx.

## Test

```bash
npm test
```

The test suite generates a real Ed25519 keypair and exercises valid signatures, missing headers,
invalid signatures, body tampering, stale timestamps, and all common event types.

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/telnyx
```

The App Router handler lives at `app/webhooks/telnyx/route.ts`. It reads the raw body with
`request.text()` before verifying — the App Router does not pre-parse the body, so the raw bytes
needed for Ed25519 verification are preserved.

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 telnyx --path /webhooks/telnyx
```

Paste the public URL into Mission Control → your messaging profile → Outbound / Inbound Webhook URL,
and set the Webhook API version to **v2 (signed)**.
