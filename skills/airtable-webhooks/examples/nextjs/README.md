# Airtable Webhooks - Next.js Example

Minimal example of receiving Airtable webhook notifications in a Next.js App Router
route handler, verifying the signature, and fetching base changes from the payloads API.

## Prerequisites

- Node.js 18+
- An Airtable webhook created via the API (see [../../references/setup.md](../../references/setup.md))
- The `macSecretBase64` returned when the webhook was created
- A Personal Access Token with `webhook:manage`, `data.records:read`, `schema.bases:read`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your `AIRTABLE_MAC_SECRET_BASE64` and `AIRTABLE_PERSONAL_ACCESS_TOKEN`.

## Run

```bash
npm run dev
```

Endpoint: `POST http://localhost:3000/webhooks/airtable`

The route reads the **raw** request body with `request.text()` (never parse before
verifying), checks `X-Airtable-Content-MAC`, and responds **200 with an empty body**.

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 airtable --path /webhooks/airtable
```

Set your webhook's `notificationUrl` to the printed URL, then edit a record to trigger it.

## Test

```bash
npm test
```

Tests import the real route handler and verifier, generate valid signatures with
Airtable's algorithm, and assert 400/200 responses plus the payload summarizer.
