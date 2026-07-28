# Zift Webhooks - Next.js Example

Minimal example of receiving Zift webhook notifications with the Next.js App
Router and returning the required `{"notificationId": ...}` acknowledgement.

> **Zift notifications have no signature.** There is no HMAC, no
> `X-Zift-Signature` header, and no auth on delivery — so there is nothing to
> cryptographically verify. Authenticity relies on **HTTPS + endpoint-URL
> secrecy**, optionally reinforced with **IP allowlisting** at your load
> balancer / firewall. The one protocol requirement is the **acknowledgement**:
> echo the received `notificationId` back in the JSON response body, or Zift
> retries and eventually marks the notification `Failed`. See the skill's
> `references/verification.md`.

## Prerequisites

- Node.js 18+
- A Zift integrator/reseller account with your HTTPS endpoint registered by Zift
  support (see the skill's `references/setup.md`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

   There is no signing secret to add — the only optional value is
   `ZIFT_ALLOWED_IPS` (informational; IP allowlisting is enforced by your infra).

## Run

```bash
npm run dev
```

The webhook route is served at http://localhost:3000/webhooks/zift

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 zift --path /webhooks/zift
```

## Endpoint

- `POST /webhooks/zift` (`app/webhooks/zift/route.ts`) - Parses a Zift
  notification, dispatches on the `billing.*` / `processing.*` `eventCode`, and
  acknowledges by echoing `notificationId`.
