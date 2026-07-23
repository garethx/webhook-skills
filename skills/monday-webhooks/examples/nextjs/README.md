# monday.com Webhooks - Next.js Example

Minimal App Router example of receiving monday.com webhooks: the `challenge`
handshake plus JWT verification of the `Authorization` header.

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
   cp .env.example .env.local
   ```

3. Add your monday.com **Signing Secret** to `.env.local` as `MONDAY_SIGNING_SECRET`.

## Run

```bash
npm run dev
```

The webhook route is available at http://localhost:3000/webhooks/monday

## How It Works

The route handler at `app/webhooks/monday/route.ts`:

1. **Challenge handshake** — echoes `{ "challenge": "…" }` back on registration
   (no JWT required for this step).
2. **JWT verification** — verifies the HS256 JWT in the `Authorization` header with
   your Signing Secret. Invalid/missing → 401.
3. **Event dispatch** — switches on `event.type`.

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

Point your webhook `url` at the public URL the CLI prints, then edit an item on the
board to trigger events.

## Endpoint

- `POST /webhooks/monday` - Handles the challenge handshake and verified events
