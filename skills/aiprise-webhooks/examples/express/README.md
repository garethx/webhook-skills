# AiPrise Webhooks - Express Example

Minimal example of receiving AiPrise callbacks (webhooks) with `X-HMAC-SIGNATURE`
verification.

## Prerequisites

- Node.js 18+
- An AiPrise account and your API private key (also the callback signing key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your AiPrise API private key to `.env` as `AIPRISE_API_KEY`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward callbacks to localhost (no account required)
npx hookdeck-cli listen 3000 aiprise --path /webhooks/aiprise
```

Set the Hookdeck-provided URL as your AiPrise template's callback URL (or per-request
`callback_url`), then run a test verification.

## Endpoint

- `POST /webhooks/aiprise` - Receives and verifies AiPrise callbacks
