# Flexport Webhooks - Express Example

Minimal example of receiving Flexport webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Flexport account with a webhook endpoint and secret token (see Settings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Flexport endpoint secret token to `.env` as `FLEXPORT_WEBHOOK_SECRET`

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
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 3000 flexport --path /webhooks/flexport
```

Then set the Hookdeck URL as your webhook endpoint in the Flexport account
Settings, and trigger a milestone on a test shipment.

## Endpoint

- `POST /webhooks/flexport` - Receives and verifies Flexport Event objects
