# Walmart Webhooks - Express Example

Minimal example of receiving Walmart Marketplace performance webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Walmart Marketplace webhook secret (from the Performance webhook endpoint setup)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your `WALMART_WEBHOOK_SECRET` to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real signatures with Walmart's algorithm):

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 walmart --path /webhooks/walmart
```

Register the Hookdeck URL as your Walmart performance webhook endpoint.

## How verification works

Walmart signs a canonical string, not the raw body directly:

```
<METHOD>\n<PATH_AND_QUERY>\n<WM_SEC.TIMESTAMP>\n<SHA256_HEX_OF_RAW_BODY>
```

`WM_SEC.SIGNATURE` is `base64(HMAC_SHA256(secret, stringToSign))`. The handler uses the **raw** body (`express.raw`), rejects stale timestamps (replay window), and only parses JSON after verifying.

## Endpoint

- `POST /webhooks/walmart` - Receives and verifies Walmart webhook events
- `GET /health` - Health check
