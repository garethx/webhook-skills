# Svix Webhooks - Express Example

Minimal example of receiving Svix webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) SDK.

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
npm start
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

## Manual Testing

Most Svix App Portals have a **Testing / Send Example** tab — dispatch a sample
event to your tunnel URL and confirm it is verified and handled.
