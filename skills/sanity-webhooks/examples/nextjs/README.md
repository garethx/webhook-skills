# Sanity Webhooks - Next.js Example

Minimal example of receiving Sanity GROQ-powered webhooks with signature
verification using the Next.js App Router and the official
[`@sanity/webhook`](https://github.com/sanity-io/webhook-toolkit) SDK.

## Prerequisites

- Node.js 18+
- A Sanity project with a webhook configured at [sanity.io/manage](https://www.sanity.io/manage)
  and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Sanity webhook signing secret to `.env.local` as `SANITY_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 sanity --path /webhooks/sanity
```

The CLI prints a public URL — set it as the webhook **URL** at sanity.io/manage,
then edit a matching document in the Studio to trigger a delivery.

## Endpoint

- `POST /webhooks/sanity` - Verifies the `sanity-webhook-signature` header and
  dispatches on the document `_type`.

## How It Works

- The route reads the **raw** body with `await request.text()` — required
  because the signature is an HMAC over the raw bytes.
- `isValidSignature(rawBody, signature, secret)` from `@sanity/webhook` verifies
  the request (it is **async** in v4+).
- After verification, the body is parsed and dispatched on `_type`
  (`post`, `author`, `product`, `category`, `page`).
