# Vapi Webhooks - Next.js Example

Receiving Vapi **Server URL** webhooks in a Next.js App Router route handler,
authenticating with a shared secret, and returning the JSON body Vapi requires
for its four request/response message types.

> **Vapi has no fixed HMAC signature.** The recommended auth is a shared secret in
> a header: `Authorization: Bearer <token>` or the legacy `X-Vapi-Secret: <token>`.
> The handler reads whichever is present and compares it against
> `VAPI_WEBHOOK_SECRET` with a timing-safe comparison. See the skill's
> `references/verification.md` for OAuth 2.0 and the configurable-HMAC options.

## Prerequisites

- Node.js 18+
- A Vapi account with a Server URL and an attached credential's shared secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Vapi shared secret to `.env` as `VAPI_WEBHOOK_SECRET`.

## Test

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 vapi --path /webhooks/vapi
```

## Endpoint

- `POST /webhooks/vapi` (`app/webhooks/vapi/route.ts`) - Authenticates on the
  shared-secret header, dispatches on `message.type`, and returns the required
  JSON body for the request/response types.
