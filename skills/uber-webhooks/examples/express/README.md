# Uber Webhooks - Express Example

Minimal example of receiving Uber Eats webhooks with `X-Uber-Signature`
verification.

## Prerequisites

- Node.js 18+
- Uber app with the Uber Eats API enabled (for the Client Secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Uber app **Client Secret** to `.env` as `UBER_CLIENT_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 uber --path /webhooks/uber
```

Then set the Hookdeck URL as your **Primary Webhook URL** in the Uber Developer
Dashboard (Webhooks tab).

### Trigger Test Events

- Place a test order in the Uber Eats sandbox to fire `orders.notification`
- Provision/deprovision a test store to fire `store.provisioned` /
  `store.deprovisioned`

## Endpoint

- `POST /webhooks/uber` - Receives and verifies Uber Eats webhook events
