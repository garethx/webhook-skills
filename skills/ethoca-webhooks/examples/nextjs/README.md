# Ethoca Webhooks - Next.js Example

Minimal example of receiving Ethoca Alerts webhooks (Push API) with HTTP Basic
Auth verification, using the Next.js App Router.

> **Ethoca Alerts have no HMAC signature.** Authenticity comes from mutual TLS
> (MSSL, Entrust CA) at the transport layer plus HTTP Basic Auth at the
> application layer. This example implements the Basic Auth check; configure mTLS
> at your load balancer / reverse proxy (see the skill's `references/verification.md`).

## Prerequisites

- Node.js 18+
- Ethoca Alerts account with a push endpoint registered by the Customer Delivery Team
- The HTTP Basic Auth username/password agreed during onboarding

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Ethoca Basic Auth credentials to `.env`.

## Run

```bash
npm run dev
```

The webhook route is available at `POST http://localhost:3000/webhooks/ethoca`.

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

- `POST /webhooks/ethoca` - Handler at `app/webhooks/ethoca/route.ts`
