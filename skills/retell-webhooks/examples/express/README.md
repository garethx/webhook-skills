# Retell AI Webhooks - Express Example

Minimal example of receiving Retell AI webhooks with signature verification.

Retell's Node SDK has no webhook verify helper, so this example verifies the
`X-Retell-Signature` header manually with Node's built-in `crypto` module.

## Prerequisites

- Node.js 18+
- A Retell API key with the webhook badge (used as the signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Retell API key to `.env` as `RETELL_API_KEY`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Development

```bash
npm run dev
```

Uses nodemon for auto-reloading during development.

## Test

```bash
npm test
```

## Endpoints

- `POST /webhooks/retell` - Receives and verifies Retell webhooks
- `GET /health` - Health check endpoint

## Local Testing with Hookdeck

Use Hookdeck CLI to receive webhooks locally:

```bash
npx hookdeck-cli listen 3000 retell --path /webhooks/retell
```

This creates a public URL that forwards to your local server. Paste it into your
Retell dashboard (Webhooks tab) or an agent's `webhook_url`, then place a test
call.
