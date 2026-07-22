# Recharge Webhooks Overview

## What Are Recharge Webhooks?

[Recharge](https://getrecharge.com) powers subscriptions and recurring billing for ecommerce stores.
Webhooks let your application react to subscription lifecycle events — charges being created, paid, or
failing; subscriptions being created, updated, or cancelled; and orders being created or processed —
without polling the API.

When a subscribed event occurs, Recharge sends an HTTP `POST` request to your registered endpoint with
a JSON payload and an `X-Recharge-Hmac-Sha256` signature header you use to verify authenticity.

## Common Event Types (Topics)

Topics use a `resource/action` format. Subscribe to one topic per webhook subscription.

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `charge/created` | A charge is queued for an upcoming order | Pre-billing checks, previews |
| `charge/paid` | A charge is successfully paid | Grant access, record revenue, fulfill |
| `charge/failed` | A charge attempt fails | Dunning, notify customer, retry logic |
| `charge/max_retries_reached` | A charge exhausted retries | Pause/cancel subscription, escalate |
| `charge/refunded` | A charge is refunded | Reverse fulfillment, adjust ledgers |
| `charge/upcoming` | A charge is scheduled to process soon | Reminders, inventory checks |
| `subscription/created` | A subscription is created | Onboarding, provisioning |
| `subscription/updated` | A subscription is modified | Sync plan/quantity/frequency changes |
| `subscription/cancelled` | A subscription is cancelled | Revoke access, win-back flows |
| `subscription/activated` | A cancelled subscription is reactivated | Restore access |
| `order/created` | An order is created | Sync to OMS/ERP |
| `order/processed` | An order is processed | Trigger fulfillment |
| `customer/created` | A customer is created | CRM sync |
| `customer/updated` | Customer details change | CRM sync, payment method updates |
| `address/updated` | A customer address changes | Update shipping records |

### A note on legacy topic names

Use `charge/paid` for the paid-charge event. `charge/success` is a legacy name that does not appear in
current documentation. Likewise `order/success` is legacy; prefer `order/created` / `order/processed`.

## Event Payload Structure

Recharge states that "callback payloads are identical to Recharge's REST API payloads." The resource is
**wrapped in a top-level key named after the resource**:

```json
{
  "charge": {
    "id": 377749210,
    "customer_id": 87475383,
    "status": "success",
    "total_price": "42.00",
    "line_items": [ ... ]
  }
}
```

So a `charge/*` topic delivers `{ "charge": { ... } }`, a `subscription/*` topic delivers
`{ "subscription": { ... } }`, an `order/*` topic delivers `{ "order": { ... } }`, and so on. When you
create a subscription you can request extra related objects via `included_objects` (e.g. `["customer"]`),
which are added as additional top-level keys.

## Webhook Request Headers

| Header | Description |
|--------|-------------|
| `X-Recharge-Hmac-Sha256` | Signature for verification (hex-encoded `sha256(client_secret + body)`) |
| `X-Recharge-Topic` | The subscription topic (e.g. `charge/paid`) — used to dispatch on the event |

## Delivery, Timeouts, and Retries

- Your endpoint must respond with **`200`** within **5 seconds**.
- Recharge treats **no response**, **`408`**, **`429`**, or any **`5xx`** as a failure.
- On failure, Recharge retries the same webhook **20 times over 48 hours**, then **deletes the webhook
  subscription** from its system. Design handlers to be fast and idempotent, and monitor for deletions.

## Full Event Reference

- [Available webhooks (topics)](https://developer.rechargepayments.com/2021-11/webhooks_endpoints/webhooks_available)
- [Using webhooks](https://docs.getrecharge.com/docs/webhooks-overview)

API versions `2021-01` and `2021-11` share the same token and topic names.
