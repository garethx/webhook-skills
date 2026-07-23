# Polar Webhooks Overview

## What Are Polar Webhooks?

[Polar](https://polar.sh) is a merchant-of-record billing platform for digital products,
subscriptions, and benefits. Webhooks let Polar notify your application in real time when
something happens — a customer completes a checkout, an order is paid, a subscription is
canceled, or a benefit is granted.

You configure one or more webhook endpoints in your Polar **organization settings**, subscribe
each endpoint to the event types you care about, and Polar sends an HTTP `POST` with a JSON
payload to your URL whenever a subscribed event fires.

Polar webhooks follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification,
so signature verification is the same shape as other Standard Webhooks providers (Clerk, etc.).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `checkout.updated` | A checkout session changes state (e.g. confirmed) | Track conversion, react to confirmed checkouts |
| `order.created` | A new order is created (purchase or renewal) | Record the order; check `billing_reason` |
| `order.paid` | An order is fully paid | Fulfill purchase, grant access, send receipt |
| `order.refunded` | An order is refunded | Reverse fulfillment, update accounting |
| `subscription.created` | A new subscription is created | Provision access, send welcome email |
| `subscription.canceled` | A subscription is set to cancel at period end | Schedule retention, mark pending cancel |
| `subscription.revoked` | A subscription ends | Revoke access to paid features |
| `customer.state_changed` | A customer's subscriptions/benefits change | Sync a single source of truth for entitlements |

Polar exposes **30+ event types** in total, spanning checkouts, customers, subscriptions,
orders, refunds, benefits, benefit grants, products, and the organization.

## Event Payload Structure

Every webhook payload has the same top-level shape:

```json
{
  "type": "order.paid",
  "data": {
    "id": "b1c2d3e4-...",
    "...": "the full resource for this event"
  }
}
```

- `type` — the event type string (e.g. `order.paid`).
- `data` — the resource itself (an Order, Subscription, Customer, etc.). Note this is the
  resource **directly**, not nested under `data.object` as some providers do.

## Delivery Behavior

- **Timeout:** Polar waits up to **10 seconds** for a response — respond fast (ideally < 2s)
  and do heavy work asynchronously.
- **Retries:** Failed deliveries (non-2xx) are retried up to **10 times** with exponential backoff.
- **Auto-disable:** After **10 consecutive failed deliveries**, the endpoint is automatically
  disabled and must be manually re-enabled in the dashboard.

## Formats: only "Raw" is verifiable

When creating an endpoint you choose a delivery **format**: `Raw`, `Discord`, or `Slack`.
Only **Raw** sends the full JSON payload with signature headers for verification. Discord and
Slack formats send human-readable messages to those channels and are not meant for programmatic
handling.

## Full Event Reference

For the complete list of events and their payloads, see
[Polar's webhook events documentation](https://polar.sh/docs/integrate/webhooks/events).
