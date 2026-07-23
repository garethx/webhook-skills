# Flexport Webhooks - Next.js Example

Minimal example of receiving Flexport webhooks with signature verification using
the Next.js App Router.

## Prerequisites

- Node.js 18+
- Flexport account with a webhook endpoint and secret token (see Settings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Flexport endpoint secret token to `.env.local` as `FLEXPORT_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 3000 flexport --path /webhooks/flexport
```

## Endpoint

- `POST /webhooks/flexport` - Receives and verifies Flexport Event objects
