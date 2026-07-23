# Picqer Webhooks - Express Example

Minimal example of receiving Picqer webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Picqer API key and a hook created with a `secret` (see below)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Picqer hook `secret` to `.env` as `PICQER_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Run the test suite

```bash
npm test
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 picqer --path /webhooks/picqer
```

Use the public URL the CLI prints as the hook `address` when you create the hook.

### Create a hook

Picqer has no dashboard UI for webhooks — create hooks via the API (HTTP Basic
auth, API key as the username):

```bash
curl -u YOUR_API_KEY: https://YOURSUBDOMAIN.picqer.com/api/v1/hooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Order completed hook",
    "event": "orders.completed",
    "address": "https://YOUR-PUBLIC-URL/webhooks/picqer",
    "secret": "your_hook_secret_here"
  }'
```

## Endpoint

- `POST /webhooks/picqer` - Receives and verifies Picqer webhook events
- `GET /health` - Health check
