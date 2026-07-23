# Nuvemshop (Tiendanube) Webhooks Overview

## What Are Nuvemshop Webhooks?

Nuvemshop (branded **Tiendanube** in Spanish-speaking markets) is a LATAM
e-commerce platform. Webhooks let your **app** receive real-time notifications
when something changes in a merchant's store — a new order, a paid order, a
product update, or the app being uninstalled.

Webhooks are registered **per app** against the REST API (not in a merchant
dashboard). Each subscription maps one `event` to one HTTPS `url`. Nuvemshop
then `POST`s a small JSON payload to that URL every time the event fires for any
store that installed your app.

## Thin Payloads

Payloads are intentionally minimal. Every payload includes at least:

| Field | Description |
|-------|-------------|
| `store_id` | The store the event belongs to (called `user_id` during OAuth) |
| `event` | The event name in `resource/action` format |
| `id` | The resource id (for resource events like `order/*`, `product/*`) |

Example:

```json
{
  "store_id": 123456,
  "event": "order/paid",
  "id": 999888
}
```

To act on the event, **fetch the full resource** from the REST API using the
`store_id` and `id`, authenticated with that store's access token:

```
GET https://api.tiendanube.com/v1/{store_id}/orders/{id}
Authentication: bearer {access_token}
User-Agent: MyApp (contact@example.com)
```

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order/created` | New order placed | Start fulfillment, notify ops |
| `order/paid` | Order payment received | Trigger shipping, record revenue |
| `order/cancelled` | Order cancelled | Restock, refund workflows |
| `order/updated` | Order modified | Re-sync order state |
| `order/packed` | Order marked as packed | Logistics updates |
| `order/fulfilled` | Order fulfilled/shipped | Send tracking to customer |
| `order/pending` | Order awaiting payment | Payment reminders |
| `product/created` | New product added | Sync to external catalog |
| `product/updated` | Product modified | Update external listings, pricing |
| `product/deleted` | Product removed | Remove from external catalog |
| `category/created` | New category added | Catalog structure sync |
| `category/updated` | Category modified | Catalog structure sync |
| `category/deleted` | Category removed | Catalog structure sync |
| `customer/created` | New customer registered | CRM sync, welcome email |
| `customer/updated` | Customer modified | CRM sync |
| `domain/updated` | Store domain changed | Update stored URLs |
| `app/uninstalled` | App uninstalled from store | Clean up store data, revoke tokens |
| `app/suspended` | App suspended for a store | Pause processing |
| `app/resumed` | App resumed for a store | Resume processing |

### LGPD / data-removal events

Nuvemshop also emits mandatory data-handling events for compliance:

| Event | Meaning |
|-------|---------|
| `store/redact` | Delete all data for a store (48h after uninstall) |
| `customers/redact` | Delete a specific customer's data |
| `customers/data_request` | Provide a customer's stored data |

## Full Event Reference

For the complete, current list of events, see
[Nuvemshop's webhook documentation](https://tiendanube.github.io/api-documentation/resources/webhook).

## Delivery & Retries

- Nuvemshop waits **3 seconds** for a `2XX` response.
- On timeout or non-2XX, it retries: once immediately, then at ~5, 10, and 15
  minutes, then exponential backoff (previous wait ×1.4) for up to **18
  attempts over 48 hours**.
- A `2XX` response stops further retries.

Because the same event can be delivered multiple times, handle events
**idempotently** — dedupe on `store_id` + `event` + `id`.
