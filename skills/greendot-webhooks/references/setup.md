# Setting Up Green Dot Webhooks

## Prerequisites

- A Green Dot Embedded Finance (BaaS) program and a Green Dot representative
- A publicly reachable **HTTPS** endpoint for your webhook receiver
- The OAuth details (or client certificate) your program will use for delivery

## There Is No Self-Serve Dashboard

Green Dot webhook endpoints are **registered by your Green Dot representative**,
not through a developer portal. To onboard, provide your rep with:

1. **Callback URL** — the HTTPS URL of your receiver (e.g.
   `https://api.example.com/webhooks/greendot`).
2. **Authentication method** — one of:
   - `OAuth` (client_credentials, the default)
   - `FormOAuth` / `FormUrlEncodedOAuth`
   - `PartnerOAuth` (token from your own authorization server)
   - `Certificate` (mTLS / PKCS#7 client certificate)
3. **Event types** — the `eventType` values you want enabled (e.g.
   `transaction`, `accountUpdated`, `achTransfer`, `cardUpdate`,
   `billPayTransfer`, `directDepositSwitch`, `provisioning`).
4. **Program code** — used to route deliveries and, if enabled, to select the
   `x-gd-signature` signing key.

## Authentication: OAuth client_credentials

The default model is OAuth 2.0 **client_credentials**. A token is minted with
the scope `post:webhook` and sent as `Authorization: Bearer <token>` on every
webhook request:

```
POST /api/v1/token
Content-Type: application/x-www-form-urlencoded

client_id=CLIENTID&client_secret=SECRET&grant_type=client_credentials&scope=post:webhook
```

The token is a Bearer credential valid for ~3600 seconds. Your endpoint's job is
to **validate that token** (signature + `post:webhook` scope) before trusting
the request. In production, validate against your authorization server (JWKS /
RS256 or token introspection). For local testing, the examples validate an
HS256 token with a shared secret (`GREENDOT_WEBHOOK_TOKEN_SECRET`).

## Optional: x-gd-signature

Some programs additionally send an `x-gd-signature` header — an HMAC signature
over the payload validated with a **program-specific signing key**. This is
optional and gated per program; sample payloads show no signature header.

The exact algorithm and encoding are **not documented publicly**. Obtain them
(and the signing key) from your Green Dot representative, then set
`GREENDOT_SIGNING_KEY`. If you do not configure a key, the examples skip the
signature check and rely on the OAuth Bearer token.

## Required Response

For every delivery your endpoint must:

1. Respond with HTTP `200` or `201`.
2. **Echo back the `x-GD-RequestId` header** that Green Dot sent.
3. Return a JSON body with a `responseDetails` array:

```json
{ "responseDetails": [{ "code": 0, "subCode": 0, "description": "<x-GD-RequestId>" }] }
```

## Retries

Retries are **not on by default** — they must be explicitly enabled for your
program. When enabled, Green Dot retries when it receives:

- HTTP `5xx`
- Timeouts, `status 0`, DNS failures, connection failures, SSL errors
- HTTP `401` / `403` — retried once the underlying cause is fixed

The schedule is an initial retry within one hour, continuing for up to
**24 hours**. Make your handler **idempotent** (dedupe on `eventId` /
`x-GD-RequestId`) so retried deliveries are safe.

## Test Mode

Green Dot provides a loopback / test-event endpoint your rep can trigger to POST
a sample event to your callback URL. Use it to confirm your endpoint validates
the token, echoes `x-GD-RequestId`, and returns the `responseDetails` body.

For local development, tunnel to your machine with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 greendot --path /webhooks/greendot
```
