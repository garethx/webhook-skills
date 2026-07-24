# WeChat Pay Webhooks - Next.js Example

Minimal example of receiving WeChat Pay (APIv3) notifications in a Next.js App Router route handler, with RSA-SHA256 signature verification and AES-256-GCM resource decryption.

## Prerequisites

- Node.js 18+
- A WeChat Pay merchant account (APIv3 key + platform public key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your platform public keys keyed by certificate serial (`WECHAT_PAY_PLATFORM_KEYS`, a JSON object) and your 32-character APIv3 key (`WECHAT_PAY_API_V3_KEY`). A single `WECHAT_PAY_PUBLIC_KEY` + `WECHAT_PAY_PLATFORM_SERIAL` pair also works, but only the map survives a certificate rotation without a redeploy.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/wechat` (see `app/webhooks/wechat/route.ts`).

## How It Works

1. Reads the raw request body via `request.text()` (never parsed before verification).
2. Verifies the `Wechatpay-Signature` (SHA256withRSA) over `"{timestamp}\n{nonce}\n{body}\n"` using the platform public key, and rejects stale timestamps (5-minute tolerance).
3. Decrypts `resource.ciphertext` (AEAD_AES_256_GCM) with the APIv3 key.
4. Dispatches on `event_type` (`TRANSACTION.SUCCESS`, `REFUND.SUCCESS`, `REFUND.CLOSED`).
5. Acknowledges with `200 {"code":"SUCCESS","message":"OK"}`.

## Test

```bash
npm test
```

## Local Development

Tunnel live WeChat Pay notifications to your machine with the Hookdeck CLI (no account required). Use the tunnel URL as your API request's `notify_url`:

```bash
npx hookdeck-cli listen 3000 wechat --path /webhooks/wechat
```
