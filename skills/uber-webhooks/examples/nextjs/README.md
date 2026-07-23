# Uber Webhooks - Next.js Example

Minimal example of receiving Uber Eats webhooks with `X-Uber-Signature`
verification using the Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your Uber app **Client Secret** to `.env.local` as `UBER_CLIENT_SECRET`.

## Run

```bash
npm run dev
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

## Endpoint

- `POST /webhooks/uber` - Receives and verifies Uber Eats webhook events
