# Nuvemshop Webhooks - Express Example

Minimal example of receiving Nuvemshop (Tiendanube) webhooks with signature
verification.

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
   cp .env.example .env
   ```

3. Add your Nuvemshop app client secret to `.env` as `NUVEMSHOP_CLIENT_SECRET`

## Run

```bash
npm start
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
URL (webhook URLs must be HTTPS):

```bash
curl -X POST "https://api.tiendanube.com/v1/{store_id}/webhooks" \
  -H "Authentication: bearer {access_token}" \
  -H "User-Agent: MyApp (contact@example.com)" \
  -H "Content-Type: application/json" \
  -d '{ "event": "order/paid", "url": "https://<your-hookdeck-url>/webhooks/nuvemshop" }'
```

## Endpoint

- `POST /webhooks/nuvemshop` - Receives and verifies Nuvemshop webhook events
