# Persona Webhooks - Express Example

Minimal example of receiving Persona webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Persona account with a webhook and its signing secret (`wbhsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Persona webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real Persona signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 persona --path /webhooks/persona
```

Then trigger events from the Persona Dashboard (create a test inquiry, or use
**Dashboard → Webhooks → Recent events → Resend** to redeliver a past event).

## Endpoint

- `POST /webhooks/persona` - Receives and verifies Persona webhook events
