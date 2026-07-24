# Enode Webhooks - Next.js Example

Minimal example of receiving Enode webhooks with HMAC-SHA1 signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- An Enode webhook created via `POST /webhooks` with a secret you generated

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Enode webhook secret to `.env.local` (the same `secret` you passed when creating the webhook)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 enode --path /webhooks/enode
```

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/enode` - Receives and verifies Enode webhook events (a JSON array of events)
