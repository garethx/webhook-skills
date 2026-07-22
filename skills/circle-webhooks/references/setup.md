# Setting Up Circle Webhooks

## Prerequisites

- A Circle account (Circle Mint or Circle Payments Network access)
- A Circle **API key** (Developer > API Keys in the console at app.circle.com).
  The API key is used to **fetch the notification public key** for signature
  verification — it is not sent in the webhook itself.
- A publicly accessible **HTTPS** endpoint that handles both `HEAD` and `POST`

## Endpoint Requirements

Circle's v2 notification delivery has two hard requirements:

1. **Handle `HEAD` and `POST`.** When you create or update a subscription, Circle
   sends a **HEAD** request to validate the endpoint. It must return `200`.
   Delivered events arrive as `POST`.
2. **Return `200 OK` to POST.** Circle treats a delivery as successful only on a
   `200`. Any non-200 response triggers **retries**.

The endpoint must be reachable over public HTTPS (use a tunnel like the Hookdeck
CLI in local development — see the SKILL's Local Development section).

## Register Your Endpoint (Subscription)

### Option A — API

Create a subscription with a POST to the CPN subscriptions endpoint:

```bash
curl -X POST https://api.circle.com/v2/cpn/notifications/subscriptions \
  -H "Authorization: Bearer $CIRCLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-webhook",
    "endpoint": "https://your-app.example.com/webhooks/circle",
    "enabled": true,
    "notificationTypes": ["*"]
  }'
```

- `endpoint` — your HTTPS receiver URL
- `name` — a label for the subscription
- `enabled` — `true` to activate
- `notificationTypes` — array of types to receive; `["*"]` subscribes to all.
  You can scope it to specific types, e.g. `["payments", "paymentIntents"]`.

When you submit this, Circle sends the HEAD validation request to `endpoint`.

Use the sandbox base URL `https://api-sandbox.circle.com` while testing.

### Option B — Console (Circle Mint customers)

In the Circle console at **app.circle.com**, go to **Developer > Subscriptions**
and add a subscription with your endpoint URL and the notification types you want.

## Get the Public Key for Verification

Circle signs each notification with a private key and exposes the matching public
key by its keyId. Each webhook includes an `X-Circle-Key-Id` header; fetch the
key once and cache it:

```bash
curl https://api.circle.com/v2/cpn/notifications/publicKey/$KEY_ID \
  -H "Authorization: Bearer $CIRCLE_API_KEY"
```

Response:

```json
{
  "data": {
    "id": "879dc113-5ca4-4ff7-a6b7-54652083fcf8",
    "algorithm": "ECDSA_SHA_256",
    "publicKey": "<base64-encoded DER (SPKI) public key>",
    "createDate": "2026-01-15T21:47:35.107250Z"
  }
}
```

See [verification.md](verification.md) for how to verify signatures with this key.

## Sandbox vs. Production

- **Sandbox:** `https://api-sandbox.circle.com` — use for development and testing.
- **Production:** `https://api.circle.com`

Set `CIRCLE_API_BASE_URL` accordingly in your environment. The examples default
to production.

## Optional: Allowlist Circle Egress IPs

CPN webhook deliveries originate from these IPs — allowlist them if your
infrastructure filters inbound traffic:

```
35.169.154.32
3.90.127.28
3.230.111.7
54.88.227.75
```
