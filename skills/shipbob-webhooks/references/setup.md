# Setting Up ShipBob Webhooks

## Prerequisites

- A ShipBob account with API access
- An API access token (Personal Access Token or OAuth application token)
- Your application's public webhook endpoint URL (HTTPS)

## Required Scopes

Subscribing requires the `webhooks_write` scope, plus the **read scope for each
topic** you subscribe to:

| Topic family | Read scope |
|--------------|------------|
| `order.*` (shipments, tracking, delivery, exceptions) | `orders_read` or `fulfillments_read` |
| `return.*` | `returns_read` |
| `wro.*` (Warehouse Receiving Orders) | `receiving_read` |
| `billing.*` | `billing_read` |

## Get Your Signing Secret

Every webhook subscription has a signing secret used to verify incoming requests.
The secret is in the form `whsec_<base64>` — you strip the `whsec_` prefix and
base64-decode the remainder to get the raw HMAC key (the `standardwebhooks`
package does this for you).

- **Dashboard:** create the webhook in the ShipBob Dashboard and copy the signing
  secret shown for the subscription.
- **API:** the signing secret is returned when you create the subscription.

Store it as `SHIPBOB_WEBHOOK_SECRET` in your environment. Never commit it.

## Register Your Endpoint (API)

Current 2026-01 API — subscribe to one or more topics at once:

```bash
curl -X POST https://api.shipbob.com/2026-01/webhook \
  -H "Authorization: Bearer $SHIPBOB_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topics": [
      "order.shipped",
      "order.shipment.delivered",
      "order.shipment.tracking.updated"
    ],
    "url": "https://your.app/webhooks/shipbob"
  }'
```

> **Legacy note:** the older 2.0 API used `POST /2.0/webhook` with a single-topic
> body `{ "topic": "order_shipped", "subscription_url": "https://..." }`. Prefer
> the current `POST /2026-01/webhook` with `{ topics: [...], url }`.

## Preview Payloads Before Going Live

In the ShipBob Dashboard, open your webhook subscription and use **"Send example"**
to deliver a sample payload for a topic to your endpoint. This is the recommended
way to see the exact JSON structure for each topic.

## Verify Delivery

- ShipBob considers delivery successful only on a `2xx` response within ~15 seconds.
- Return `200` **fast** — verify the signature, enqueue the work, and respond.
  Do the heavy processing asynchronously (see the webhook-handler-patterns skill).
- Failed deliveries retry: immediately, 5s, 5m, 30m, 2h, 5h, 10h, 10h. Persistent
  failures over ~5 days auto-disable the endpoint and email account owners.

## Local Testing

Use the Hookdeck CLI to receive live webhooks on your machine without deploying:

```bash
npx hookdeck-cli listen 3000 shipbob --path /webhooks/shipbob
```

No account is required — the CLI creates a guest account, gives you a public URL
to register with ShipBob, and provides a web UI to inspect and replay requests.
