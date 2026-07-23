# Bridge (bridge.xyz) Webhooks - Next.js Example

Minimal example of receiving Bridge webhooks with RSA-SHA256 signature
verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Bridge webhook endpoint created via the API, and its `public_key` (PEM)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's `public_key` (from the Bridge webhook create/update API
   response) to `BRIDGE_WEBHOOK_PUBLIC_KEY` in `.env`. Store it single-line with
   `\n` escapes — the route converts them back to newlines.

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/bridge-xyz

## Test

Run the test suite (generates real RSA signatures with a throwaway keypair):

```bash
npm test
```

### Receive live events locally

Use the Hookdeck CLI to tunnel Bridge deliveries to your local server (no account
required):

```bash
npx hookdeck-cli listen 3000 bridge-xyz --path /webhooks/bridge-xyz
```

Point your Bridge webhook `url` at the tunnel URL, then trigger a test delivery:

```bash
curl --request POST \
  --url https://api.bridge.xyz/v0/webhooks/<webhookID>/send \
  --header 'Api-Key: <your-api-key>'
```

## Endpoint

- `POST /webhooks/bridge-xyz` - Receives and verifies Bridge webhook events
  (`app/webhooks/bridge-xyz/route.ts`)
