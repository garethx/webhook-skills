# RingCentral Webhooks - Express Example

Minimal example of receiving RingCentral webhooks with the Validation-Token
handshake and optional Verification-Token check.

## Prerequisites

- Node.js 18+
- A RingCentral app + subscription pointed at your endpoint (see
  [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. (Optional) Add your `RINGCENTRAL_VERIFICATION_TOKEN` to `.env` — the same value
   you set as `verificationToken` on the subscription.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (provides the required HTTPS address)
npx hookdeck-cli listen 3000 ringcentral --path /webhooks/ringcentral
```

Use the Hookdeck HTTPS URL as the `deliveryMode.address` when creating your
RingCentral subscription.

### Trigger Test Events

- Creating/renewing the subscription triggers the **Validation-Token handshake**
- Send an SMS, leave a voicemail, or change presence in the RingCentral sandbox to
  trigger notifications

### Run the automated tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/ringcentral` - Handles the handshake and verifies notifications
- `GET /health` - Health check
