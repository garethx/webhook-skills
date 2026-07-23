# TikTok Shop Webhooks - Express Example

Minimal example of receiving TikTok Shop webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A TikTok Shop Partner Center app with an `app_key` and `app_secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your TikTok Shop `app_key` and `app_secret` to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 — webhook endpoint is
`POST /webhooks/tiktok-shop`.

## How It Works

- The route reads the **raw** request body (`express.raw`) — required because the
  signature is computed over the exact bytes received.
- It verifies the `Authorization` header: a lowercase-hex **HMAC-SHA256** over
  `app_key + rawBody`, keyed by `app_secret`. No `Bearer` prefix, no timestamp.
- Invalid or missing signature → **401**. Valid → **200 with an empty body**.
- It resolves the numeric `type` to an event name and dispatches. Dedupe on
  `tts_notification_id` before doing real work (delivery is at-least-once).

## Test

```bash
npm test
```

The tests generate real signatures with TikTok Shop's algorithm and cover
missing, invalid, tampered, and valid signatures plus event dispatch.

## Local Development

Tunnel public webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 tiktok-shop --path /webhooks/tiktok-shop
```
