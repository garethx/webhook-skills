# CloudSignal Webhooks - Express Example

Minimal example of receiving CloudSignal (Cloudprinter.com) webhooks and
authenticating them via the `apikey` field in the JSON body.

> **CloudSignal has no HMAC signature.** Each POST carries a plaintext,
> per-endpoint **Webhook API key** in the JSON body's `apikey` field. The handler
> compares it against `CLOUDSIGNAL_WEBHOOK_APIKEY` with a timing-safe comparison.
> There is no signature header, no timestamp, and it is **not** Standard Webhooks.

## Prerequisites

- Node.js 18+
- A Cloudprinter.com account with a CloudSignal webhook endpoint registered, and
  its **Webhook API key** (from the Cloudprinter.com Dashboard)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your CloudSignal **Webhook API key** to `.env` as `CLOUDSIGNAL_WEBHOOK_APIKEY`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 cloudsignal --path /webhooks/cloudsignal
```

## Endpoint

- `POST /webhooks/cloudsignal` - Authenticates on the body `apikey`, dispatches on the signal `type`
