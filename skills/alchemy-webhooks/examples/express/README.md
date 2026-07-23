# Alchemy Webhooks - Express Example

Minimal example of receiving Alchemy Notify webhooks with `X-Alchemy-Signature` verification.

## Prerequisites

- Node.js 18+
- An Alchemy webhook configured in the [Notify dashboard](https://dashboard.alchemy.com/) with its
  per-webhook signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Alchemy webhook signing key to `.env` as `ALCHEMY_SIGNING_KEY` (copy it from the top-right
   of the webhook's detail page in the Notify dashboard).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Run the tests

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no install, no account required)
npx hookdeck-cli listen 3000 alchemy --path /webhooks/alchemy
```

Then set the resulting Hookdeck URL as the webhook target in the Alchemy Notify dashboard, and use the
webhook's **"Test Webhook"** button to send a signed sample payload.

## Endpoint

- `POST /webhooks/alchemy` - Receives and verifies Alchemy webhook events
- `GET /health` - Health check
