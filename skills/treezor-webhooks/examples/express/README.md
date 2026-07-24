# Treezor Webhooks - Express Example

Minimal example of receiving Treezor webhooks with signature verification.

Treezor's signature is a **field in the JSON body** (`object_payload_signature`), not
an HTTP header, and it covers the canonicalized `object_payload` — see
[../../references/verification.md](../../references/verification.md).

## Prerequisites

- Node.js 18+
- A Treezor `webhook_secret` (from your Treezor Account Manager)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Treezor webhook secret to `.env`

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

### Receive webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 treezor --path /webhooks/treezor
```

This prints a public URL. Register it as your subscription's `url` via
`POST /settings/hooks` on `https://webhook.sandbox.treezor.co` (see
[../../references/setup.md](../../references/setup.md)).

## Endpoint

- `POST /webhooks/treezor` - Receives and verifies Treezor webhook events
