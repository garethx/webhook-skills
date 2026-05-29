# Standard Webhooks - Express Example

Minimal example of receiving webhooks that follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification (canonical `webhook-id` / `webhook-timestamp` / `webhook-signature` headers), verified with the official `standardwebhooks` npm package.

## Prerequisites

- Node.js 18+
- A Standard Webhooks signing secret (`whsec_...`) from your provider

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env`:
   ```bash
   WEBHOOK_SECRET=whsec_xxxxx
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000 with the webhook endpoint at `POST /webhooks/standard`.

## Test

Run the included tests, which generate real Standard Webhooks signatures locally:

```bash
npm test
```

To receive live webhooks on `localhost`, start the Hookdeck CLI tunnel:

```bash
npx hookdeck-cli listen 3000 standard --path /webhooks/standard
```

Paste the printed URL into your provider's webhook endpoint configuration.
