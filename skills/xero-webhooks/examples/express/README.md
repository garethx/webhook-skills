# Xero Webhooks - Express Example

Minimal example of receiving Xero webhooks with `x-xero-signature` verification, including passing Xero's Intent to Receive (ITR) validation.

## Prerequisites

- Node.js 18+
- A Xero app with a **webhook signing key** (Webhooks tab at [developer.xero.com/app/manage](https://developer.xero.com/app/manage))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Xero webhook signing key to `.env` as `XERO_WEBHOOK_KEY`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit/integration tests (generates real signatures with Xero's algorithm):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to forward Xero deliveries to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 xero --path /webhooks/xero
```

Put the printed URL (with `/webhooks/xero`) in your app's **Delivery URL** field, then click **Send "Intent to receive"** in the Xero portal. Once ITR passes, make a change in a connected organisation (e.g. create a contact) to trigger a real event.

## How verification works

- Xero signs the **raw** body with HMAC-SHA256 using your signing key, base64-encoded, in `x-xero-signature`.
- The endpoint returns **200** for a valid signature and **401** for an invalid one — exactly what ITR requires.
- Return `401` (not `400`) for bad signatures, or ITR fails and the webhook stays inactive.

## Endpoint

- `POST /webhooks/xero` - Receives, verifies, and dispatches Xero webhook events
- `GET /health` - Health check
