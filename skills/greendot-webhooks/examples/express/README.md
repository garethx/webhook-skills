# Green Dot Webhooks - Express Example

Minimal example of receiving Green Dot Embedded Finance (BaaS) webhooks with
OAuth Bearer token authentication.

## Prerequisites

- Node.js 18+
- A Green Dot program (endpoint registered by your Green Dot rep) with the OAuth
  token secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GREENDOT_WEBHOOK_TOKEN_SECRET` in `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives webhooks at
`POST /webhooks/greendot`.

## How It Works

1. **Authenticate** the OAuth client_credentials Bearer token and require the
   `post:webhook` scope (returns `401` otherwise).
2. **Parse** the JSON body and dispatch on `eventType`.
3. **Acknowledge** with `200`, echoing the `x-GD-RequestId` header and returning
   a `responseDetails` body.

> The `x-gd-signature` header is **not** verified — its algorithm is undocumented
> (see [../../TODO.md](../../TODO.md)).

> This example validates an HS256 token with a shared secret so it is
> self-contained. In production, validate the token against your authorization
> server (JWKS / RS256 or introspection). See
> [../../references/verification.md](../../references/verification.md).

## Test

```bash
npm test
```

The tests generate real OAuth tokens using the same algorithm as the handler.

## Local Development

Tunnel Green Dot deliveries to your local server with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 greendot --path /webhooks/greendot
```

No account required — the CLI creates a guest account and provides a local
tunnel plus a web UI for inspecting requests.
