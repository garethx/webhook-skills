# Svix Webhooks - Next.js Example

Next.js App Router example for receiving Svix webhooks using the official
[`svix`](https://www.npmjs.com/package/svix) SDK.

## Prerequisites

- Node.js 18+
- A signing secret (`whsec_...`) from a sender that delivers via Svix

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Svix signing secret to `.env` (`SVIX_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/svix
```

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 svix --path /webhooks/svix
```

Use the printed URL as the endpoint URL in your sender's Svix App Portal.

## Project Structure

```
├── app/
│   └── webhooks/
│       └── svix/
│           └── route.ts    # Webhook handler
├── test/
│   └── webhook.test.ts     # Tests
└── vitest.config.ts        # Test configuration
```
