# Bunny Stream Webhooks - Next.js Example

Minimal example of receiving Bunny Stream webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Bunny Stream video library with a webhook URL configured

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your library's **Read-Only API key** to `.env.local` as `BUNNY_STREAM_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 bunny-stream --path /webhooks/bunny-stream
```

Then set the Hookdeck URL as the Webhook URL in your Bunny Stream library settings.

## Endpoint

- `POST /webhooks/bunny-stream` - Receives and verifies Bunny Stream webhook events

## Run tests

```bash
npm test
```
