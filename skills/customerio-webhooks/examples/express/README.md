# Customer.io Webhooks - Express Example

Minimal example of receiving Customer.io Reporting Webhooks with `X-CIO-Signature` verification.

## Prerequisites

- Node.js 18+
- A Customer.io workspace with a Reporting Webhook and its signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Customer.io webhook signing key to `.env`:
   ```bash
   CUSTOMERIO_WEBHOOK_SIGNING_KEY=your_signing_key
   ```
   Find it on the **Reporting Webhooks** integration page in Customer.io account settings.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook at `POST /webhooks/customerio`.

## Test

Run the automated tests (they generate real `v0:<timestamp>:<body>` HMAC-SHA256 signatures):

```bash
npm test
```

## Receive Real Webhooks Locally

Expose your local server with the Hookdeck CLI (no account required, no install needed):

```bash
npx hookdeck-cli listen 3000 customerio --path /webhooks/customerio
```

The CLI prints a public URL — set it as the **Endpoint URL** in your Customer.io Reporting
Webhook configuration, then trigger some messaging activity (e.g. send yourself an email and
open it) to see `email` `sent` / `delivered` / `opened` events arrive.

## How Verification Works

Customer.io signs the string `v0:<X-CIO-Timestamp>:<raw body>` with HMAC-SHA256 (hex digest)
and sends it in `X-CIO-Signature`. This example verifies the **raw** body before parsing JSON.
See [../../references/verification.md](../../references/verification.md) for details.
