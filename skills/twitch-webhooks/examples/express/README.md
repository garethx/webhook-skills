# Twitch Webhooks - Express Example

Minimal example of receiving Twitch EventSub webhooks with signature
verification, the verification-challenge handshake, and event dispatch.

## Prerequisites

- Node.js 18+
- A Twitch application (Client ID + Secret) and an EventSub subscription secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Twitch EventSub subscription secret to `.env` as
   `TWITCH_WEBHOOK_SECRET`. This is the value you pass as `transport.secret`
   when creating the subscription via `POST /helix/eventsub/subscriptions`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook at
`POST /webhooks/twitch`.

## Receive Webhooks Locally

Twitch requires an HTTPS callback on port 443. Tunnel to your local server with
the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 twitch --path /webhooks/twitch
```

Use the printed HTTPS URL as the `callback` when you create the subscription.
Twitch will immediately send a `webhook_callback_verification` request — this
handler verifies the signature and echoes back the `challenge`.

## Test

```bash
npm test
```

The tests generate real Twitch signatures (HMAC-SHA256 over
`messageId + timestamp + body`) and cover the challenge handshake,
notifications, revocation, and replay protection.
