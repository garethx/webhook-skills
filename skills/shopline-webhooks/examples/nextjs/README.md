# SHOPLINE Webhooks - Next.js Example

Minimal example of receiving SHOPLINE webhooks with signature verification using
the Next.js App Router.

## Prerequisites

- Node.js 18+
- A SHOPLINE app with its **app secret** (Developer Center → App credentials)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your SHOPLINE app secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Run unit tests

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 3000 shopline --path /webhooks/shopline
```

## Endpoint

- `POST /webhooks/shopline` - Receives and verifies SHOPLINE webhook events
