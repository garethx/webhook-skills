# FastSpring Webhooks Overview

## What Are FastSpring Webhooks?

FastSpring is an ecommerce and subscription-management platform. It uses webhooks
to notify your application when events happen in your store — a completed order, an
activated subscription, a successful or failed recurring charge, a cancellation, or
a refund. Instead of polling the API, FastSpring sends an HTTPS POST to your
configured endpoint whenever a subscribed event occurs.

## Batched Event Payloads

Unlike many providers, each FastSpring POST **batches multiple events** in a single
request. The body is a JSON object with an `events` array:

```json
{
  "events": [
    {
      "id": "abc123",
      "type": "order.completed",
      "live": true,
      "processed": false,
      "created": 1700000000000,
      "data": { }
    },
    {
      "id": "def456",
      "type": "subscription.charge.completed",
      "live": true,
      "processed": false,
      "created": 1700000000001,
      "data": { }
    }
  ]
}
```

Verify the signature **once** against the whole raw body, then iterate `events` and
dispatch on each `event.type`.

### Event Fields

| Field | Description |
|-------|-------------|
| `id` | Unique event identifier. Automatic retries reuse the same id (dedupe on it); manual retries get a new id |
| `type` | Event name (e.g., `order.completed`) |
| `live` | `true` for production, `false` for test events |
| `processed` | Delivery/processing status flag |
| `created` | Timestamp in milliseconds |
| `data` | Event-specific object (order, subscription, etc.) |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.completed` | An order is successfully completed | Provision access, fulfill, send receipt |
| `order.failed` | An order fails | Alert, retry payment flow |
| `order.canceled` | An order is canceled | Revoke provisional access |
| `subscription.activated` | A new subscription is activated | Grant access, start entitlement |
| `subscription.charge.completed` | A recurring charge succeeds | Extend entitlement, record revenue |
| `subscription.charge.failed` | A recurring charge fails | Dunning, notify customer |
| `subscription.updated` | A subscription is updated | Sync plan/quantity changes |
| `subscription.canceled` | A subscription is canceled | Schedule end-of-term downgrade |
| `subscription.deactivated` | A subscription is deactivated | Revoke access |
| `return.created` | A return/refund is created | Reverse entitlement, adjust revenue |

Additional events include `account.created`, `account.updated`, `chargeback.created`,
`fulfillment.failed`, subscription co-term (`subscription.group.*`), quote
(`quote.*`), payout (`payoutEntry.created`), and mailing-list events.

## Headers

| Header | Description |
|--------|-------------|
| `X-FS-Signature` | Base64-encoded HMAC-SHA256 of the raw body (present only when an HMAC secret is configured) |

## Delivery & Retries

- Endpoints must be served over **HTTPS**.
- FastSpring **auto-retries** delivery until your endpoint returns HTTP `200`.
- Automatic retries reuse the same event `id` — dedupe on `id` to stay idempotent.
- Optional: allowlist FastSpring's source IP `107.23.30.83`.

## Full Event Reference

For the complete list of events and payload schemas, see the
[FastSpring Webhooks documentation](https://developer.fastspring.com/reference/webhooks-overview).
