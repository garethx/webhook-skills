# Smartcar Webhooks - Next.js Example

Minimal example of receiving Smartcar webhooks in a Next.js App Router route
handler, with `SC-Signature` verification and VERIFY-challenge handling.

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
   cp .env.example .env.local
   ```

3. Add your Application Management Token to `.env.local` as
   `SMARTCAR_MANAGEMENT_TOKEN`.

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/smartcar

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

- `app/webhooks/smartcar/route.ts` handles `POST`:
  - `VERIFY` → responds `200 { challenge: hashChallenge(AMT, data.challenge) }`
  - `VEHICLE_STATE` / `VEHICLE_ERROR` → verifies the `SC-Signature` header
    (hex HMAC-SHA256 of the raw body) via the Smartcar SDK, returns `401` if it
    fails, otherwise processes and returns `200`

The route reads the raw body with `await request.text()` before parsing, and
verifies with the official [`smartcar`](https://www.npmjs.com/package/smartcar)
Node SDK (`verifyPayload`, `hashChallenge`).
