# Airtable Webhooks - Express Example

Minimal example of receiving Airtable webhook notifications with signature
verification, then fetching the actual base changes from the payloads API.

## Prerequisites

- Node.js 18+ (uses the built-in `fetch`)
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
   cp .env.example .env
   ```

3. Add your `AIRTABLE_MAC_SECRET_BASE64` and `AIRTABLE_PERSONAL_ACCESS_TOKEN` to `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/airtable`.

## How It Works

1. Airtable sends a **thin ping** (`base.id`, `webhook.id`, `timestamp`) — no change data.
2. The handler verifies `X-Airtable-Content-MAC`, then responds **200 with an empty body**.
3. After acknowledging, it calls the payloads API (paging on `mightHaveMore`) and
   summarizes created/changed/destroyed records per table.

## Local Testing with Hookdeck

Expose your local server (no account required):

```bash
npx hookdeck-cli listen 3000 airtable --path /webhooks/airtable
```

Set your webhook's `notificationUrl` to the URL the CLI prints, then edit a record in
your base to trigger a notification.

## Test

```bash
npm test
```

Tests generate real signatures with Airtable's algorithm (HMAC-SHA256 over the raw body,
keyed on the base64-decoded secret, hex-encoded, `hmac-sha256=` prefix) and assert
400/200 responses plus the payload summarizer.
