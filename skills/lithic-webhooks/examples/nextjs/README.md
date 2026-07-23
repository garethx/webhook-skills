# Lithic Webhooks - Next.js Example

Minimal example of receiving Lithic webhooks with signature verification using the Next.js App Router and the official `lithic` Node SDK.

## Prerequisites

- Node.js 18+
- Lithic account with an event subscription and signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Lithic webhook signing secret (starts with `whsec_`) to `.env.local`. Copy it from the Lithic Dashboard when you create the event subscription.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000.

## Test

```bash
npm test
```

## Receive Webhooks Locally

Use the Hookdeck CLI — no account required, one paste-and-run line:

```bash
npx hookdeck-cli listen 3000 lithic --path /webhooks/lithic
```

The CLI prints a public URL. Register it as your event subscription URL in the Lithic Dashboard, then trigger events (or replay them from the Hookdeck UI).

## Endpoint

- `POST /webhooks/lithic` — Receives and verifies Lithic webhook events
