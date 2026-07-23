# USPS Webhooks - Next.js Example

Minimal example of receiving USPS tracking webhooks (Subscriptions - Tracking
API v3.2) with `X-HMAC` signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A USPS tracking subscription created with a 32-char `secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your USPS subscription secret to `.env.local` as `USPS_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real `X-HMAC` signatures):

```bash
npm test
```

### Receive live webhooks with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 usps --path /webhooks/usps
```

Use the printed HTTPS URL as the `listenerURL` when you create your USPS
subscription (`POST /subscriptions`).

## Endpoint

- `POST /webhooks/usps` - Receives and verifies USPS tracking notifications
