# Front Webhooks - Next.js Example

Minimal example of receiving Front application webhooks with signature verification and the
`X-Front-Challenge` subscription handshake, using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Front app with a webhook signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Front app signing key to `.env` as `FRONT_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real Front signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Front webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 frontapp --path /webhooks/frontapp
```

Use the printed HTTPS URL as the endpoint in your Front app's webhook configuration. Front
will send an `X-Front-Challenge` validation request first — this handler echoes it
automatically.

## Endpoint

- `POST /webhooks/frontapp` - Receives, validates the challenge, and verifies Front webhooks
  (see `app/webhooks/frontapp/route.ts`)
