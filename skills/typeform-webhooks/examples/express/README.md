# Typeform Webhooks - Express Example

Minimal example of receiving Typeform webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Typeform form with a webhook secret configured

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Typeform webhook secret to `.env` as `TYPEFORM_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Run the unit tests

```bash
npm test
```

### Receive live webhooks locally

Typeform requires an HTTPS endpoint. The Hookdeck CLI provides a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 typeform --path /webhooks/typeform
```

Point your webhook `url` (in the Typeform UI or Webhooks API) at the HTTPS URL the CLI prints, then submit a test response to your form.

## Endpoint

- `POST /webhooks/typeform` - Receives and verifies Typeform webhook events
