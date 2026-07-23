# Statsig Webhooks - Express Example

Minimal example of receiving Statsig Event Webhook (Generic Webhook) requests with signature verification.

## Prerequisites

- Node.js 18+
- A Statsig project with the **Generic Webhook** integration enabled and a signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Statsig webhook signing secret to `.env` (Project Settings → **Integrations** → **Generic Webhook** → signing secret on the integration card).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Statsig events to your local server (no account needed)
npx hookdeck-cli listen 3000 statsig --path /webhooks/statsig
```

Paste the Hookdeck URL into the **destination URL** field of the Generic Webhook integration in Statsig.

### Trigger Test Events

- Toggle or edit a feature gate / experiment → `Config Change` event
- Evaluate a gate for a user in your app → `Exposure` event (if enabled)

### Run Unit Tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/statsig` — Verifies the `X-Statsig-Signature` header and dispatches config-change (`{ data: [...] }`) and exposure (array) batches.
