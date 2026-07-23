# Twitter / X Webhooks - Next.js Example

Minimal example of receiving Twitter/X Account Activity API webhooks with CRC
handling and signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- An approved X developer account with Account Activity API access
- Your app's **consumer secret** (API Secret Key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your consumer secret to `.env.local` (X Developer Portal → your App →
   **Keys and tokens** → **API Key and Secret**).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward X events to your local server (no account needed)
npx hookdeck-cli listen 3000 twitter --path /webhooks/twitter
```

Register the printed HTTPS URL with the V2 Webhooks API (`POST /2/webhooks`). X
sends a CRC `GET` immediately; the route answers it automatically.

### Run Unit Tests

```bash
npm test
```

## Endpoints

- `GET /webhooks/twitter` — Answers the CRC `crc_token` challenge with a `response_token`.
- `POST /webhooks/twitter` — Verifies the `x-twitter-webhooks-signature` header and dispatches Account Activity events.
