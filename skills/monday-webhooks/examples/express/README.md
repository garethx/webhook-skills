# monday.com Webhooks - Express Example

Minimal example of receiving monday.com webhooks: the `challenge` handshake plus
JWT verification of the `Authorization` header.

## Prerequisites

- Node.js 18+
- A monday.com app with a **Signing Secret** (Developer Center → your app → Basic Information)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your monday.com **Signing Secret** to `.env` as `MONDAY_SIGNING_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## How It Works

1. **Challenge handshake** — on registration monday.com POSTs `{ "challenge": "…" }`.
   The handler echoes it back with a 200 (no JWT required for this step).
2. **JWT verification** — every real request carries an HS256 JWT in the
   `Authorization` header, verified with your Signing Secret. Invalid/missing → 401.
3. **Event dispatch** — real events wrap their data in an `event` object; the handler
   switches on `event.type`.

> The JWT does not sign the request body, so JSON is parsed before verification —
> see [../../references/verification.md](../../references/verification.md).

## Test

### Run the test suite

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 monday --path /webhooks/monday
```

Point your webhook `url` (Integrations center or the `create_webhook` mutation) at
the public URL the CLI prints, then edit an item on the board to trigger events.

## Endpoint

- `POST /webhooks/monday` - Handles the challenge handshake and verified events
- `GET /health` - Health check
