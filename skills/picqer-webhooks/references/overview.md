# Picqer Webhooks Overview

## What Are Picqer Webhooks?

[Picqer](https://picqer.com) is a warehouse management system (WMS). Webhooks
("hooks") let Picqer notify your application in real time when something happens
in a warehouse — an order is created, a picklist is closed, stock changes, and
so on — instead of you polling the API.

Each hook is registered for a **single event** and delivers an HTTP `POST`
request to your endpoint whenever that event fires. Unlike many providers,
Picqer has **no dashboard UI for webhooks** — hooks are created and managed
entirely through the API (`POST /api/v1/hooks`).

## Common Event Types

Picqer sends the event name in the payload's `event` field (there is no event
header). These are the most commonly handled events:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `orders.created` | A new order is created | Sync order to ERP, trigger downstream flows |
| `orders.completed` | An order is fully processed | Notify customer, close order in other systems |
| `orders.status_changed` | An order's status changes | Keep external order state in sync |
| `picklists.created` | A picklist is created | Kick off picking workflows |
| `picklists.closed` | A picklist is closed (picked) | Trigger packing / shipping |
| `picklists.shipments.created` | A shipment is created for a picklist | Send tracking info to the customer |
| `products.created` | A product is created | Sync catalog to storefront |
| `products.stock_changed` | A product's stock level changes | Update stock on your storefront |
| `purchase_orders.created` | A purchase order is created | Notify suppliers, sync procurement |
| `returns.created` | A return is created | Start return handling / refunds |

## Full Event List

Picqer supports many more events, grouped by resource:

- **Orders:** `orders.created`, `orders.allocated`, `orders.closed`, `orders.paused`, `orders.resumed`, `orders.status_changed`, `orders.completed`, `orders.notes.created`
- **Picklists:** `picklists.created`, `picklists.changed`, `picklists.paused`, `picklists.resumed`, `picklists.closed`, `picklists.cancelled`, `picklists.snoozed`, `picklists.unsnoozed`, `picklists.shipments.created`, `picklists.shipments.cancelled`
- **Picklist batches:** `picklist_batches.created`, `picklist_batches.changed`, `picklist_batches.completed`
- **Products:** `products.created`, `products.changed`, `products.free_stock_changed`, `products.stock_changed`, `products.assembled_stock_changed`, `products.stock_on_location_changed`, `products.parts.changed`
- **Purchase orders:** `purchase_orders.created`, `purchase_orders.changed`, `purchase_orders.purchased`, `purchase_orders.receipts.created`
- **Receipts:** `receipts.created`, `receipts.completed`, `receipts.product_received`, `receipts.product_reverted`
- **Returns:** `returns.created`, `returns.changed`, `returns.status_changed`, `returns.products_received`
- **Other:** `comments.created`, `movements.moved`, `location_stock_counts.completed`, `tasks.created`, `tasks.changed`, `tasks.deleted`, `tasks.completed`, `tasks.uncompleted`, `webshop_orders.imported`

For the authoritative, up-to-date list, see the
[Picqer webhooks documentation](https://picqer.com/en/api/webhooks).

## Event Payload Structure

Every webhook delivery has the same top-level shape:

```json
{
  "idhook": 12345,
  "name": "My hook",
  "event": "orders.completed",
  "event_triggered_at": "2026-07-22 10:30:00",
  "data": { }
}
```

| Field | Description |
|-------|-------------|
| `idhook` | The ID of the hook that produced this delivery |
| `name` | The name you gave the hook when creating it |
| `event` | The event type (dispatch on this) |
| `event_triggered_at` | When the event fired (Picqer server time) |
| `data` | The full resource that triggered the event (order, picklist, product, …) |

Picqer does **not** send a dedicated idempotency key. To deduplicate retried
deliveries, derive a key from the resource ID inside `data` (e.g. `data.idorder`,
`data.idpicklist`) combined with `event` and `event_triggered_at`.

## Delivery, Retries & Timeouts

- Your endpoint must respond with `200`, `201`, or `202` within **10 seconds**.
- Failed deliveries are retried **15 times over ~17 hours**.
- A hook is **automatically deactivated after 5 complete failures within 24 hours**.
- Picqer's API rate limit is normally **500 requests/minute** (dynamic); exceeding
  it returns HTTP `429` with Picqer error code `28`.

Because deliveries are retried, handlers must be **idempotent**. Picqer sends no
idempotency key, so deduplicate on the resource ID inside `data` (e.g.
`data.idorder`) plus `event` and `event_triggered_at` to avoid processing the
same event twice.

## Full Documentation

For complete details, see the
[Picqer webhooks documentation](https://picqer.com/en/api/webhooks).
