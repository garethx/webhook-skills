# Ethoca Webhooks - Express Example

Minimal example of receiving Ethoca Alerts webhooks (Push API), secured by mTLS
with optional HTTP Basic Auth.

> **Ethoca Alerts have no HMAC signature.** Authenticity comes from mutual TLS
> (MSSL, Entrust CA) at the transport layer — the definitive check. HTTP Basic
> Auth is an OPTIONAL second factor, applied only if you agreed credentials at
> onboarding. This example implements the Basic Auth check *when credentials are
> configured*; otherwise it relies on mTLS. Configure mTLS at your load balancer
> / reverse proxy (see the skill's `references/verification.md`).

## Prerequisites

- Node.js 18+
- Ethoca Alerts account with a push endpoint registered by the Customer Delivery Team
- Optionally, the HTTP Basic Auth username/password if agreed during onboarding

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. If you agreed Basic Auth at onboarding, add the credentials to `.env`.
   Otherwise leave them unset to run mTLS-only.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 ethoca --path /webhooks/ethoca
```

Note: a tunnel terminates TLS at the tunnel provider, so the real mTLS path
cannot be exercised locally — validate mTLS in a staging environment.

## Endpoint

- `POST /webhooks/ethoca` - Receives and authenticates Ethoca Alerts, dispatches on `alertType`
