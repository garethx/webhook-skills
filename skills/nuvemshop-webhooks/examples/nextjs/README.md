# Nuvemshop Webhooks - Next.js Example

Minimal example of receiving Nuvemshop (Tiendanube) webhooks with signature
verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Nuvemshop app with its **Client secret** (from the Partners Portal)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Nuvemshop app client secret to `.env.local` as `NUVEMSHOP_CLIENT_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real `x-linkedstore-hmac-sha256` signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account needed)
npx hookdeck-cli listen 3000 nuvemshop --path /webhooks/nuvemshop
```

Then register a webhook against the Nuvemshop API pointing at the tunnel's HTTPS
URL (webhook URLs must be HTTPS).

## Endpoint

- `POST /webhooks/nuvemshop` - Receives and verifies Nuvemshop webhook events
