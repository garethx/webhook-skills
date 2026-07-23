# Wix Webhooks - Next.js Example

Minimal example of receiving Wix webhooks in a Next.js App Router route with signature verification via the official [`@wix/sdk`](https://www.npmjs.com/package/@wix/sdk).

Wix delivers each webhook as an HTTP POST whose **entire body is a JWT** signed (RS256) by Wix. `@wix/sdk` verifies that JWT with your app's public key and dispatches the decoded event to typed handlers.

## Prerequisites

- Node.js 18+
- A Wix app with at least one webhook subscribed (see [../../references/setup.md](../../references/setup.md))
- Your app's **public key** and **App ID**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your `WIX_APP_ID` and `WIX_PUBLIC_KEY` to `.env`. Get the public key from **App Dashboard → Webhooks → Get Public Key** and the App ID from the **OAuth** page.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST /webhooks/wix` (handled by `app/webhooks/wix/route.ts`), served at http://localhost:3000/webhooks/wix.

## Test

Run the test suite (generates real RS256-signed JWTs and verifies them through `@wix/sdk`):

```bash
npm test
```

## Receive Webhooks Locally

Use the Hookdeck CLI to tunnel public webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 wix --path /webhooks/wix
```

Use the printed HTTPS URL (with the `/webhooks/wix` path) as the **Callback URL** when creating the webhook in your Wix app dashboard.

## How It Works

1. `AppStrategy({ appId, publicKey })` configures the client with your app's public key.
2. Handlers are registered per event with `client.orders.onOrderCreated(...)`, `onOrderApproved`, `onOrderUpdated`, `onOrderCanceled`.
3. The route reads the **raw text body** (`await request.text()`) and calls `client.webhooks.process(rawBody)`, which verifies the RS256 signature, decodes the event, and runs the matching handler.
4. Invalid signatures return `400`; verified events return `200`.
5. Events are deduplicated on `event.metadata._id` because Wix retries and can deliver duplicates out of order.

> **Note:** Next.js App Router route handlers give you the raw body via `request.text()` and don't parse or buffer it, so no special body-parser config is needed — exactly what JWT verification requires.
