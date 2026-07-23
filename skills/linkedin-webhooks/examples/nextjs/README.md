# LinkedIn Webhooks - Next.js Example

Minimal App Router example of receiving LinkedIn webhooks with **endpoint validation** (GET challenge) and **signature verification** (POST `X-LI-Signature`).

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
   cp .env.example .env.local
   ```

3. Add your LinkedIn app client secret as `LINKEDIN_CLIENT_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Route

`app/webhooks/linkedin/route.ts` exports:

- `GET` — endpoint validation. Echoes `challengeCode` with a computed `challengeResponse` (answer within 3s).
- `POST` — event delivery. Reads the raw body, verifies `X-LI-Signature`, dedupes on `notificationId`, dispatches on notification type.

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

## How verification works

Both checks are HMAC-SHA256 keyed with your `clientSecret`, hex-encoded:

- **Challenge:** `hex(HMACSHA256(challengeCode, clientSecret))`
- **Signature:** `hex(HMACSHA256("hmacsha256=" + rawBody, clientSecret))` — the `hmacsha256=` prefix is only in the string-to-sign, not the header.

See [../../references/verification.md](../../references/verification.md) for details.
