# Oura Webhooks - Express Example

Minimal example of receiving Oura webhooks with the subscription handshake and
`x-oura-signature` verification.

## Prerequisites

- Node.js 18+
- An Oura application (Client ID + Client Secret) from the
  [Oura Developer portal](https://cloud.ouraring.com/oauth/applications)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`:
   - `OURA_CLIENT_SECRET` — HMAC key for the signature
   - `OURA_VERIFICATION_TOKEN` — the token you pass when creating the subscription

## Run

```bash
npm start
```

Server runs on http://localhost:3000

- `GET  /webhooks/oura` — subscription handshake (echoes the `challenge`)
- `POST /webhooks/oura` — receives and verifies webhook events

## Test

Run the unit/integration tests (real signatures, handshake, and event dispatch):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Oura deliveries to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 oura --path /webhooks/oura
```

Set the printed Hookdeck URL as the `callback_url` when you create a subscription:

```bash
curl -X POST https://api.ouraring.com/v2/webhook/subscription \
  -H "x-client-id: $OURA_CLIENT_ID" \
  -H "x-client-secret: $OURA_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "callback_url": "https://<your-hookdeck-url>/webhooks/oura",
    "verification_token": "your_verification_token_here",
    "event_type": "update",
    "data_type": "sleep"
  }'
```

You can also test the handshake directly:

```bash
curl "http://localhost:3000/webhooks/oura?verification_token=your_verification_token_here&challenge=hello"
# → {"challenge":"hello"}
```
