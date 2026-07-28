# Quoter Webhooks - Next.js Example

Minimal example of receiving Quoter webhooks with MD5 hash verification using
the Next.js App Router.

Quoter POSTs `application/x-www-form-urlencoded` with three fields — `hash`,
`timestamp`, and `data` — and signs with `md5(HASH_KEY + timestamp + data)`.
This is a weak scheme (MD5, form field, optional key), **not** HMAC-SHA256 and
**not** Standard Webhooks. Always configure a Hash Key in Quoter.

## Prerequisites

- Node.js 18+
- A Quoter account with a webhook configured under Settings → Integrations (with a Hash Key set)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Quoter Hash Key to `.env.local` (`QUOTER_HASH_KEY`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Object Type Routing

Quoter doesn't identify the object type in the request. Configure a distinct
target URL per object type using the `?object=` query parameter, matching the
webhook's "Applies To" setting:

- Quote → `https://yourapp.com/webhooks/quoter?object=quote`
- Person → `https://yourapp.com/webhooks/quoter?object=person`
- Payment → `https://yourapp.com/webhooks/quoter?object=payment`

## Test

Run the test suite (generates real MD5 hashes):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 quoter --path /webhooks/quoter
```

Point the Quoter webhook target URL at the URL the CLI prints (append
`?object=quote`, `?object=person`, or `?object=payment`), then create or update
a matching object in Quoter.

## Endpoint

- `POST /webhooks/quoter` - Receives and verifies Quoter webhook deliveries
