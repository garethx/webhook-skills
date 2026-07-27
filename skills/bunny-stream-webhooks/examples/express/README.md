# Bunny Stream Webhooks - Express Example

Minimal example of receiving Bunny Stream webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Bunny Stream video library with a webhook URL configured

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your library's **Read-Only API key** to `.env` as `BUNNY_STREAM_WEBHOOK_SECRET`
   (this is the value Bunny Stream signs webhooks with).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 bunny-stream --path /webhooks/bunny-stream
```

Then set the Hookdeck URL as the Webhook URL in your Bunny Stream library settings.

### Trigger Test Events

- Upload a short video to the library. As it processes you'll receive callbacks
  with `Status` values progressing toward `3` (Finished).

## Endpoint

- `POST /webhooks/bunny-stream` - Receives and verifies Bunny Stream webhook events

## Run tests

```bash
npm test
```
