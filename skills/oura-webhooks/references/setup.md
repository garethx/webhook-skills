# Setting Up Oura Webhooks

Oura has **no dashboard UI for webhooks** — subscriptions are managed entirely through the
REST API. This guide covers getting credentials, subscribing, completing the handshake, and
renewing.

## Prerequisites

- An Oura application at the [Oura Developer portal](https://cloud.ouraring.com/oauth/applications)
- Your app's **Client ID** and **Client Secret**
- A publicly reachable HTTPS `callback_url` that handles both `GET` and `POST`
- A **verification token** — a secret string *you* choose (any hard-to-guess value)

## Credentials

| Value | Where it comes from | Used for |
|-------|---------------------|----------|
| `x-client-id` | App settings (Client ID) | Authenticating subscription-management calls |
| `x-client-secret` | App settings (Client Secret) | Auth **and** the HMAC key for `x-oura-signature` |
| `verification_token` | You choose it | Proving the handshake `GET` is for your subscription |

> The **Client Secret is the HMAC key** used to sign event payloads. Keep it server-side.

## Step 1 — Create a Subscription

Managed at `POST /v2/webhook/subscription`, authenticated with `x-client-id` and
`x-client-secret` headers. One subscription per `data_type` + `event_type` pair.

```bash
curl -X POST https://api.ouraring.com/v2/webhook/subscription \
  -H "x-client-id: $OURA_CLIENT_ID" \
  -H "x-client-secret: $OURA_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "callback_url": "https://your-server.com/webhooks/oura",
    "verification_token": "your-secret-verification-token",
    "event_type": "update",
    "data_type": "sleep"
  }'
```

All four body fields are **required**: `callback_url`, `verification_token`, `event_type`,
`data_type`.

## Step 2 — The Verification Handshake

Immediately after you call create, Oura verifies your endpoint owns the URL:

1. Oura sends a `GET` to your `callback_url`:
   ```
   GET https://your-server.com/webhooks/oura?verification_token=your-token&challenge=random-string
   ```
2. Your endpoint checks `verification_token` matches the one you configured, then responds
   `200` with the challenge echoed back as JSON:
   ```json
   { "challenge": "random-string" }
   ```
3. On success the subscription becomes active and the create call returns the subscription
   (including its `id` and `expiration_time`).

If the token doesn't match, respond `401` and the subscription is not created.

## Step 3 — Manage Subscriptions

All routes use the `x-client-id` + `x-client-secret` headers.

| Action | Route |
|--------|-------|
| List all | `GET /v2/webhook/subscription` |
| Get one | `GET /v2/webhook/subscription/{id}` |
| Create | `POST /v2/webhook/subscription` |
| Update | `PUT /v2/webhook/subscription/{id}` |
| Delete | `DELETE /v2/webhook/subscription/{id}` |
| Renew | `PUT /v2/webhook/subscription/renew/{id}` |

`PUT` (update) and `PUT .../renew` also trigger a fresh handshake, so keep your `GET`
handler live.

## Step 4 — Renew Before Expiry

Subscriptions carry an `expiration_time`. Before it passes, call:

```bash
curl -X PUT https://api.ouraring.com/v2/webhook/subscription/renew/$SUBSCRIPTION_ID \
  -H "x-client-id: $OURA_CLIENT_ID" \
  -H "x-client-secret: $OURA_CLIENT_SECRET"
```

Automate renewal (e.g. a scheduled job) so subscriptions never lapse. If a subscription
expires, you stop receiving events until you re-subscribe.

## Testing Locally

Use the Hookdeck CLI to tunnel Oura deliveries to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 oura --path /webhooks/oura
```

Set the printed Hookdeck URL as your subscription's `callback_url`. Because the handshake is
a plain `GET`, you can also test it directly:

```bash
curl "http://localhost:3000/webhooks/oura?verification_token=your-token&challenge=hello"
# → {"challenge":"hello"}
```
