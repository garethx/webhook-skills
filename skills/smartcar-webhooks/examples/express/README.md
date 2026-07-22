# Smartcar Webhooks - Express Example

Minimal example of receiving Smartcar webhooks with `SC-Signature` verification
and VERIFY-challenge handling.

## Prerequisites

- Node.js 18+
- A Smartcar Dashboard account and an **Application Management Token** (AMT)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Application Management Token to `.env` as `SMARTCAR_MANAGEMENT_TOKEN`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 smartcar --path /webhooks/smartcar
```

Use the printed HTTPS URL as your Callback URI in the Smartcar Dashboard. On
save, Smartcar sends a `VERIFY` event — this handler answers it automatically so
the webhook activates.

## How it works

- `POST /webhooks/smartcar` — receives Smartcar webhook events
  - `VERIFY` → responds `200 { challenge: hashChallenge(AMT, data.challenge) }`
  - `VEHICLE_STATE` / `VEHICLE_ERROR` → verifies the `SC-Signature` header
    (hex HMAC-SHA256 of the raw body) via the Smartcar SDK, returns `401` if it
    fails, otherwise processes and returns `200`
- `GET /health` — health check

Verification uses the official [`smartcar`](https://www.npmjs.com/package/smartcar)
Node SDK (`verifyPayload`, `hashChallenge`).
