# LinkedIn Webhooks - Express Example

Minimal example of receiving LinkedIn webhooks with **endpoint validation** (GET challenge) and **signature verification** (POST `X-LI-Signature`).

## Prerequisites

- Node.js 18+
- A LinkedIn app with an approved webhook use case and its **Client Secret**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your LinkedIn app client secret to `.env` as `LINKEDIN_CLIENT_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Endpoints

- `GET /webhooks/linkedin` — endpoint validation. Echoes `challengeCode` with a computed `challengeResponse` (must answer within 3s).
- `POST /webhooks/linkedin` — event delivery. Verifies `X-LI-Signature`, dedupes on `notificationId`, dispatches on notification type.

## Test

### Run the unit tests

```bash
npm test
```

### Receive real webhooks locally

LinkedIn requires HTTPS and does not support ngrok. Use the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 linkedin --path /webhooks/linkedin
```

Register the Hookdeck URL in the LinkedIn Developer Portal (or via `PUT /rest/eventSubscriptions` / `POST /rest/leadNotifications`), then trigger an action (submit a Lead Gen Form, comment on org content).

## How verification works

Both checks are HMAC-SHA256 keyed with your `clientSecret`, hex-encoded:

- **Challenge:** `hex(HMACSHA256(challengeCode, clientSecret))`
- **Signature:** `hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))` — the `hmacsha256=` prefix is only in the string-to-sign, not the header.

See [../../references/verification.md](../../references/verification.md) for details.
