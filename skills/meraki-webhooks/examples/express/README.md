# Cisco Meraki Webhooks - Express Example

Minimal example of receiving Cisco Meraki Dashboard webhook alerts and verifying
the `sharedSecret` carried in the request body.

> Meraki has **no HMAC signature header**. The "Shared secret" you set on the
> HTTP server is echoed back inside the JSON body as `sharedSecret`; you verify
> with a timing-safe string compare. TLS is the real transport protection.

## Prerequisites

- Node.js 18+
- A Meraki HTTP server configured with a **Shared secret**
  (Dashboard → Network-wide → Alerts → Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MERAKI_WEBHOOK_SECRET` in `.env` to the exact "Shared secret" from your
   Meraki HTTP server.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook at
`POST /webhooks/meraki`.

## Test

Run the test suite (generates valid and invalid payloads):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 meraki --path /webhooks/meraki
```

Point your Meraki HTTP server URL at the tunnel URL the CLI prints, then click
**Send test** on the HTTP server in the Dashboard.
