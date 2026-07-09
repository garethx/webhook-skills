# Statsig Webhooks - Next.js Example

Minimal example of receiving Statsig event webhooks with signature verification using Next.js App Router.

## Prerequisites

- Node.js 18+
- Statsig account with a configured Event Webhook and signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Statsig webhook signing secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 3000 statsig --path /webhooks/statsig
```

Then send a test event from the Statsig **Webhook Debug** tool in your project's integration settings.

## Endpoint

- `POST /webhooks/statsig` - Receives and verifies Statsig webhook events
