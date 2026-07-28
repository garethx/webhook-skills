# Faundit Webhooks - Next.js Example

Minimal example of receiving Faundit webhooks with signature verification using the Next.js
App Router.

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
   cp .env.example .env.local
   ```

3. Add your Faundit webhook signing secret to `.env.local`:
   ```bash
   FAUNDIT_WEBHOOK_SECRET=your_signing_secret
   ```

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook route is at
`POST /webhooks/faundit`.

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
endpoint.

## How It Works

- The route reads the **raw** body with `await request.text()` before parsing.
- Verification uses the current **v1** scheme: HMAC-SHA256 (hex) over
  `v1:<X-Faundit-Timestamp>:<raw body>`, compared against the
  `X-Faundit-Signature-Next` header.
- Invalid or missing signatures return `400`; valid deliveries return `200`.

## Events Handled

- `item-status` — item status changes (`delivered`, `in-route`, `finished`, `expired`, …)
- `request-status` — request status changes (`registered`, `resolved`, `not-found`, …)

## Endpoint

- `POST /webhooks/faundit` - Receives and verifies Faundit webhook events
