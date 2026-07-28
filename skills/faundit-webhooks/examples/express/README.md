# Faundit Webhooks - Express Example

Minimal example of receiving Faundit webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Faundit webhook signing secret (request from **tech@faundit.com** — not self-service)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Faundit webhook signing secret to `.env`:
   ```bash
   FAUNDIT_WEBHOOK_SECRET=your_signing_secret
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite:

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 faundit --path /webhooks/faundit
```

Then give the Hookdeck URL to your Faundit contact so deliveries route to your local
endpoint, and trigger item/request status changes in Faundit.

## How It Works

- Verification uses the current **v1** scheme: HMAC-SHA256 (hex) over
  `v1:<X-Faundit-Timestamp>:<raw body>`, compared against the
  `X-Faundit-Signature-Next` header.
- The raw body is used (via `express.raw`) so the signature matches exactly.
- Invalid or missing signatures return `400`; valid deliveries return `200`.

## Events Handled

- `item-status` — item status changes (`delivered`, `in-route`, `finished`, `expired`, …)
- `request-status` — request status changes (`registered`, `resolved`, `not-found`, …)

## Endpoint

- `POST /webhooks/faundit` - Receives and verifies Faundit webhook events
