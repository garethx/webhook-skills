# Uber Webhooks Overview

## What Are Uber Webhooks?

Uber Eats sends webhooks to notify your integration about order and store
lifecycle changes — a new order arriving, an order being cancelled, a store
being provisioned for your app, or a store going online/offline. Your app
registers a single **Primary Webhook URL** per integration in the Uber
Developer Dashboard, and Uber POSTs a JSON payload to that URL each time an
event fires.

Each request is signed with an `X-Uber-Signature` header so you can verify it
genuinely came from Uber before acting on it.

> **Uber Direct (Deliveries)** is a separate product with its own webhook
> scheme (a dedicated per-webhook Signing Key, delivered as `x-uber-signature` /
> `x-postmates-signature`). This skill focuses on Uber Eats; see
> [verification.md](verification.md) for the Uber Direct differences.

## Common Event Types

The event type is carried in the JSON body's `event_type` field (there is no
event-type header).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `orders.notification` | A new order is created for your store | Ingest the order into your POS, print a ticket |
| `orders.cancel` | An order is cancelled (non-v1.0.0 stores) | Void the order, stop preparation |
| `orders.failure` | An order is cancelled (API v1.0.0 only) | Void the order, alert staff |
| `orders.release` | Fast order release is enabled and the courier reaches the geo-fence | Start final preparation / hand-off |
| `orders.scheduled.notification` | A scheduled order is created (API v1.0.0 only) | Queue the order for its scheduled time |
| `order.fulfillment_issues.resolved` | The customer confirms a fulfillment change (e.g. item substitution) | Update the order, resume preparation |
| `store.provisioned` | A store grants your app access | Begin syncing menu/availability |
| `store.deprovisioned` | A store removes your app's access | Stop syncing, clean up |
| `store.status.changed` | A store's online status changes | Reflect open/closed state in your system |

## Event Payload Structure

Uber Eats webhook payloads share a common envelope:

```json
{
  "event_id": "e6f2...",
  "event_type": "orders.notification",
  "event_time": 1699900000,
  "meta": {
    "user_id": "0c85...",
    "resource_id": "b1a2...",
    "status": "pos",
    "resource_href": "https://api.uber.com/v2/eats/order/b1a2..."
  },
  "resource_href": "https://api.uber.com/v2/eats/order/b1a2..."
}
```

Order webhooks are intentionally lightweight — they notify you that something
happened and give you a `resource_href` to fetch the full order details from
the Uber Eats API. Verify the signature, acknowledge with `200`, then fetch the
resource asynchronously.

## Acknowledging Deliveries

Respond with HTTP `200` and an **empty body**. Uber retries failed deliveries
(`500`/`502`/`503`/`504`, timeouts, network errors) with backoff (10s, 30s, 60s,
120s, then exponential) up to ~7 attempts. Because retries happen, handle events
idempotently using `event_id`.

## Full Event Reference

For the complete list of events and payload fields, see
[Uber Eats Webhooks documentation](https://developer.uber.com/docs/eats/guides/webhooks).
