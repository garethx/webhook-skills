# BigCommerce Webhooks Overview

## What Are BigCommerce Webhooks?

BigCommerce webhooks notify your application in near real time when events
happen in a store — an order is placed, a product changes, a customer signs up,
a cart is abandoned. Instead of polling the API, you subscribe to a **scope**
(event type) and BigCommerce sends an HTTPS `POST` to your endpoint.

Unlike many platforms, BigCommerce webhooks are **created via the API only** —
there is no dashboard UI for managing them. See [setup.md](setup.md).

## Thin Payloads

BigCommerce payloads are intentionally minimal. The `data` object contains only
the resource `type` and `id`, not the full resource. Read the event from the
`scope` field and call the REST API back to fetch complete details.

```json
{
  "store_id": "1000",
  "producer": "stores/abc123",
  "scope": "store/order/statusUpdated",
  "data": { "type": "order", "id": 173331 },
  "hash": "a1b2c3d4e5",
  "created_at": 1561479335
}
```

| Field | Description |
|-------|-------------|
| `store_id` | Numeric store identifier |
| `producer` | Origin, formatted `stores/{store_hash}` |
| `scope` | The event type (e.g. `store/order/created`) — dispatch on this |
| `data.type` | Resource type (`order`, `product`, `customer`, `cart`, `sku`) |
| `data.id` | Resource id — use it to fetch the full resource via the REST API |
| `hash` | Deduplication hash — useful as an idempotency key |
| `created_at` | Unix timestamp of the event |

## Common Event Types

Dispatch on the `scope` field.

| Scope | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `store/order/created` | An order is created (storefront, control panel, app, or API) | Fulfilment, accounting sync |
| `store/order/updated` | Any field on an order changes | Re-sync order state |
| `store/order/statusUpdated` | An order's status changes | Trigger shipping, refunds, notifications |
| `store/order/refund/created` | A refund is submitted for an order | Accounting, customer notifications |
| `store/product/created` | A product is added | Catalog indexing |
| `store/product/updated` | A product's attributes change | Re-sync product data |
| `store/product/deleted` | A product is removed | Remove from catalog |
| `store/product/inventory/updated` | Base product stock level changes | Stock sync |
| `store/customer/created` | A new customer registers | CRM / marketing list sync |
| `store/customer/updated` | Customer information changes | Re-sync customer data |
| `store/cart/created` | A new cart is created | Analytics |
| `store/cart/updated` | A cart is modified | Analytics |
| `store/cart/abandoned` | A cart sees no activity for 1+ hour | Abandoned-cart recovery emails |
| `store/cart/converted` | A cart becomes an order | Analytics, attribution |
| `store/sku/created` | A new SKU (variant) is generated | Catalog / inventory sync |
| `store/sku/inventory/updated` | Variant-level inventory changes | Stock sync |

## Delivery, Retries, and Blocklisting

- **Respond HTTP 200 immediately.** Anything else counts as a failed delivery.
- New hooks can take **up to a minute** to activate.
- Failed deliveries **retry over ~48 hours** (starting ~60s apart, backing off up
  to daily). After that the hook is deactivated and the app owner emailed.
- If a domain's success ratio drops below **90% in a 2-minute sliding window**
  (after at least 100 deliveries), it is **blocklisted for 3 minutes** per client id.
- Hooks require an **HTTPS endpoint on port 443** — no custom ports, no
  self-signed certificates.

## Full Event Reference

For the complete list of scopes, see the
[BigCommerce Webhook Events reference](https://developer.bigcommerce.com/docs/integrations/webhooks/events).
