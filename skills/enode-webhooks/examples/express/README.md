# Enode Webhooks - Express Example

Minimal example of receiving Enode webhooks with HMAC-SHA1 signature verification.

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
   cp .env.example .env
   ```

3. Add your Enode webhook secret to `.env` (the same `secret` you passed when creating the webhook)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 enode --path /webhooks/enode
```

Use the Hookdeck URL as your webhook `url` when creating the Enode webhook, then invoke Enode's Test Webhook endpoint (`POST /webhooks/{id}/test`) to send an `enode:webhook:test` event.

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/enode` - Receives and verifies Enode webhook events (a JSON array of events)
