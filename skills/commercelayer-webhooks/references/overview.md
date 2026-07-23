# Commerce Layer Webhooks Overview

## What Are Commerce Layer Webhooks?

Commerce Layer webhooks are real-time HTTP callbacks that notify your application when
something happens in your organization — an order is placed, a payment is captured, a
shipment ships, and so on. You subscribe to a **topic** and Commerce Layer sends a
`POST` request to your `callback_url` whenever that event fires.

Each webhook subscribes to exactly one topic. Topics use the format
`{resource}.{trigger}` (for example `orders.place` or `shipments.ship`).

## How Delivery Works

- Commerce Layer `POST`s a JSON:API payload to your `callback_url`.
- The request carries two headers:
  - `X-CommerceLayer-Signature` — base64 HMAC-SHA256 of the raw body (see [verification.md](verification.md)).
  - `X-CommerceLayer-Topic` — the topic that triggered the callback (e.g. `orders.place`).
- Your endpoint must respond with a **2xx** status within **5 seconds**.
- On failure, Commerce Layer retries **up to 10 times**.
- After **5** unsuccessful attempts, the organization owner and admins are notified.
- After **30 consecutive failures**, the webhook's **circuit breaker** trips
  (`circuit_state`/`circuit_failure_count`) and the webhook is disabled until an admin
  resets it manually.

## Common Event Types (Topics)

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `orders.place` | Customer places an order | Start fulfillment, notify ops |
| `orders.approve` | Order is approved | Trigger downstream processing |
| `orders.cancel` | Order is cancelled | Release stock, refund flows |
| `orders.pay` | Order is paid (payment captured) | Record revenue, kick off fulfillment |
| `orders.refund` | Order is refunded | Update accounting, notify customer |
| `customers.create` | A new customer is created | CRM sync, welcome email |
| `shipments.ship` | A shipment is shipped | Send tracking, update order status |
| `shipments.deliver` | A shipment is delivered | Close order, request review |

These are the topics the example handlers in this skill dispatch on. Commerce Layer
supports **100+ topics** across many resources.

## Other Notable Topics

| Resource | Example topics |
|----------|----------------|
| `orders` | `orders.authorize`, `orders.void`, `orders.start_fulfilling`, `orders.fulfill` |
| `customers` | `customers.acquired`, `customers.anonymization_completed` |
| `refunds` | `refunds.succeeded`, `refunds.failed` |
| `returns` | `returns.request`, `returns.approve`, `returns.ship`, `returns.receive` |
| `authorizations` / `captures` | `authorizations.succeeded`, `captures.succeeded` |
| `gift_cards` | `gift_cards.purchase`, `gift_cards.activate` |

For the complete, authoritative list see the
[Commerce Layer webhooks documentation](https://docs.commercelayer.io/core/real-time-webhooks).

## Event Payload Structure

The body is a JSON:API document, identical to fetching the same resource through the
REST API. For example, an `orders.place` callback:

```json
{
  "data": {
    "id": "yzkWXfWDnu",
    "type": "orders",
    "attributes": {
      "number": 1234,
      "status": "placed",
      "payment_status": "authorized",
      "fulfillment_status": "unfulfilled",
      "currency_code": "USD",
      "total_amount_cents": 10000
    },
    "relationships": {
      "line_items": { "data": [ { "id": "...", "type": "line_items" } ] },
      "customer": { "data": { "id": "...", "type": "customers" } }
    }
  }
}
```

Notes:

- Use `include_resources` when creating the webhook to embed related resources (like the
  REST API's `include` query parameter) so you avoid extra API calls.
- For `.tagged` topics, tags are automatically included as relationships.
- For `.destroy` topics, only `data.id` is populated — all other attributes and
  relationships are `null`.

## Full Event Reference

- [Real-time webhooks](https://docs.commercelayer.io/core/real-time-webhooks)
- [Callbacks security](https://docs.commercelayer.io/core/callbacks-security)
