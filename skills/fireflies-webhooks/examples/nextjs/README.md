# Fireflies Webhooks - Next.js Example

Minimal example of receiving Fireflies.ai webhooks with signature verification
using the Next.js App Router.

## Prerequisites

- Node.js 18+
- Fireflies account with a webhook signing secret (Settings > Developer Settings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Fireflies webhook signing secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 fireflies --path /webhooks/fireflies
```

Then set the URL the CLI prints as your **Webhook URL** in Fireflies Developer
Settings.

## Endpoint

- `POST /webhooks/fireflies` - Receives and verifies Fireflies webhook events
