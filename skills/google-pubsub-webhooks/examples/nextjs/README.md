# Google Cloud Pub/Sub Webhooks - Next.js Example

Minimal example of receiving Google Cloud Pub/Sub **push subscription** messages
with the Next.js App Router, verifying the OIDC token Pub/Sub attaches with
[`google-auth-library`](https://www.npmjs.com/package/google-auth-library).

## Prerequisites

- Node.js 18+
- A Google Cloud project with a Pub/Sub topic and a push subscription
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `PUBSUB_AUDIENCE` and `PUBSUB_SERVICE_ACCOUNT_EMAIL` in `.env.local` to
   match your push subscription.

   There is **no signing secret** — Pub/Sub does not have one. Authenticity
   comes from a Google-signed OIDC JWT in the `Authorization` header.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook endpoint is
`POST /webhooks/google-pubsub`.

## Receive webhooks locally

Pub/Sub only pushes to a publicly reachable HTTPS URL. Start a tunnel with the
Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 google-pubsub --path /webhooks/google-pubsub
```

Use the printed HTTPS URL as the subscription's `--push-endpoint`. If the
subscription has no explicit `--push-auth-token-audience`, the audience **is**
that full URL — set `PUBSUB_AUDIENCE` to it exactly, including the path.

Then publish a message:

```bash
gcloud pubsub topics publish my-topic \
  --message='{"orderId":"123","total":4995}' \
  --attribute=eventType=order.created
```

## Files

| File | Purpose |
|------|---------|
| `app/webhooks/google-pubsub/route.ts` | The route handler: envelope parsing and dispatch |
| `lib/pubsub.ts` | Token verification and authentication, importable from tests |

Verification lives in `lib/` because Next.js route files may only export HTTP
methods and route config — a shared module keeps the route valid while staying
directly testable.

## How it works

1. Authenticates the request **before** parsing anything:
   - `google-auth-library` verifies the RS256 signature against Google's public
     keys and checks `aud` and `exp`.
   - `lib/pubsub.ts` then checks `iss`, `email`, and `email_verified` itself —
     the library does not, and without the `email` check any Google-signed token
     with the right audience would pass.
2. Optionally compares a `?token=` query parameter for subscriptions that cannot
   use OIDC (a shared-secret convention, not a signature scheme).
3. Fails closed: with no authentication configured it returns 500 until
   `PUBSUB_ALLOW_UNAUTHENTICATED=true` is set explicitly, which is what the
   Pub/Sub emulator needs.
4. Parses the push envelope, optionally rejecting an unexpected `subscription`.
5. Base64-decodes `message.data`, handling the case where it is **absent**
   (attribute-only messages) or not JSON.
6. Responds `204` to ack. Any non-2xx — or exceeding the ack deadline (default
   10s) — is a nack and Pub/Sub redelivers.

The route runs on the Node.js runtime (`export const runtime = 'nodejs'`)
because `google-auth-library` needs Node crypto. Note there is no raw-body
handling: the OIDC token authenticates the caller, not the body, so
`request.json()` is correct for Pub/Sub.

## Test

```bash
npm test
```

The tests generate a throwaway RSA key pair, sign **real RS256 OIDC tokens**
with it, and hand `google-auth-library` the matching public key so it performs a
genuine signature verification. They cover valid tokens, wrong audience, wrong
service account, unverified email, non-Google issuer, expired tokens, tampered
signatures and payloads, unknown key ids, attribute-only and non-JSON messages,
malformed envelopes, subscription allowlisting, the `?token=` fallback, and the
fail-closed configuration path.
