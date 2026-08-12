# Vapi Webhooks - Express Example

Minimal example of receiving Vapi **Server URL** webhooks, authenticating them
with a shared secret, and handling both informational messages and the four
request/response types that need a JSON body back.

> **Vapi has no fixed HMAC signature.** The recommended, fully-specified auth is a
> shared secret in a header: `Authorization: Bearer <token>` (Bearer Token
> credential) or `X-Vapi-Secret: <token>` (legacy). The handler reads whichever is
> present and compares it against `VAPI_WEBHOOK_SECRET` with a timing-safe
> comparison. OAuth 2.0 and a configurable HMAC are also available — see the
> skill's `references/verification.md`.

## Prerequisites

- Node.js 18+
- A Vapi account with a Server URL configured and a credential attached, and that
  credential's shared secret

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

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive webhooks locally

`vapi listen` is a local forwarder only — pair it with a tunnel, or use the
Hookdeck CLI for a public URL:

```bash
npx hookdeck-cli listen 3000 vapi --path /webhooks/vapi
```

## Endpoint

- `POST /webhooks/vapi` - Authenticates on the shared-secret header, dispatches on
  `message.type`, and returns the required JSON body for `assistant-request`,
  `tool-calls`, `transfer-destination-request`, and `knowledge-base-request`.
