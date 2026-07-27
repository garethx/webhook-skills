# TikTok Webhooks - Express Example

Minimal example of receiving TikTok for Developers webhooks with
`TikTok-Signature` verification.

> Not TikTok Shop — those use a different portal and signature scheme.

## Prerequisites

- Node.js 18+
- A [TikTok for Developers](https://developers.tiktok.com/) app with a **client
  secret**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your app's **client secret** to `.env` as `TIKTOK_CLIENT_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real `TikTok-Signature` values):

```bash
npm test
```

## Receive real webhooks locally

Start a tunnel (no account required) and point it at your local handler:

```bash
npx hookdeck-cli listen 3000 tiktok --path /webhooks/tiktok
```

Register the printed public HTTPS URL (with `/webhooks/tiktok` appended) as your
callback URL in the TikTok developer portal, subscribe to events, then trigger an
action (deauthorize the app, publish a video) and watch the delivery arrive.

## How It Works

- TikTok POSTs a JSON event with a `TikTok-Signature: t=<ts>,s=<hex>` header.
- The handler reads the **raw body**, computes
  `HMAC-SHA256(client_secret, "<ts>.<raw_body>")` (hex), rejects stale
  timestamps, and compares to `s` (401 on mismatch).
- After verifying, it parses the envelope and the `content` JSON string, then
  dispatches on `event` and returns **200** quickly.

See [../../references/verification.md](../../references/verification.md) for details.
