# Fireflies Webhooks - Express Example

Minimal example of receiving Fireflies.ai webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Fireflies account with a webhook signing secret (Settings > Developer Settings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Fireflies webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 fireflies --path /webhooks/fireflies
```

Then set the URL the CLI prints as your **Webhook URL** in Fireflies Developer
Settings, or pass it as the `webhook` field in an `uploadAudio` mutation.

### Trigger Test Events

- Record or upload a meeting in Fireflies. When transcription finishes, Fireflies
  POSTs a `Transcription completed` event to your endpoint.

## Endpoint

- `POST /webhooks/fireflies` - Receives and verifies Fireflies webhook events
