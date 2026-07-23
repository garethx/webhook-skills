# Pipedrive Webhooks - Express Example

Minimal example of receiving Pipedrive webhooks with HTTP Basic Auth
verification.

> Pipedrive does **not** sign webhooks (no HMAC, no signature header). It
> authenticates deliveries with the HTTP Basic Auth credentials you configure on
> the webhook. This handler verifies those credentials with a timing-safe
> comparison.

## Prerequisites

- Node.js 18+
- A Pipedrive account (to create the webhook and choose Basic Auth credentials)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PIPEDRIVE_WEBHOOK_USER` and `PIPEDRIVE_WEBHOOK_PASSWORD` in `.env` to the
   same `http_auth_user` / `http_auth_password` you set on the webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 — endpoint `POST /webhooks/pipedrive`.

## Register a Webhook (optional)

Set `PIPEDRIVE_API_TOKEN` and `PIPEDRIVE_SUBSCRIPTION_URL` in `.env`, then:

```bash
npm run register
```

This uses the official `pipedrive` SDK to create a webhook pointing at your URL.

## Test locally with a tunnel

Pipedrive requires a public HTTPS URL. Expose your local server with the Hookdeck
CLI (no account required):

```bash
npx hookdeck-cli listen 3000 pipedrive --path /webhooks/pipedrive
```

Use the printed HTTPS URL as the webhook's `subscription_url`.

## Test

```bash
npm test
```

The tests build real HTTP Basic Auth headers (`Basic base64(user:password)`) and
assert 401 (bad/missing credentials), 400 (invalid payload), and 200 (valid
delivery).
