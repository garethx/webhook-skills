# SHOPLINE Webhooks Overview

## What Are SHOPLINE Webhooks?

SHOPLINE is an e-commerce platform. The **SHOPLINE Open Platform**
(`developer.shopline.com`) lets apps subscribe to **webhooks** so they are
notified the moment something changes in a merchant's store — a new order, a
product update, a customer registration — instead of polling the Admin API.

When a subscribed event fires, SHOPLINE sends an HTTP `POST` with a JSON body to
your configured endpoint URL. The SHOPLINE Open Platform is modeled closely on
Shopify, so the webhook topics, headers, and HMAC signing scheme will look
familiar if you have integrated with Shopify.

## Common Event Types

SHOPLINE webhook topics use a `resource/action` slash format:

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `orders/create` | A new order is placed | Fulfill order, sync to ERP, send notifications |
| `orders/update` | Order details change | Update fulfillment status, sync changes |
| `orders/paid` | Order payment completes | Trigger fulfillment, record revenue |
| `orders/cancelled` | An order is cancelled | Refund processing, inventory adjustment |
| `products/create` | A new product is added | Sync to external catalog |
| `products/update` | Product details change | Update external listings |
| `products/delete` | A product is removed | Remove from external catalog |
| `collect/create` | A product is added to a collection | Re-sync merchandising / category feeds |
| `collect/delete` | A product is removed from a collection | Re-sync merchandising / category feeds |
| `customers/create` | A new customer registers | Welcome email, CRM sync |
| `app/uninstalled` | The app is uninstalled | Cleanup, data export |

Exact topic strings and payload schemas are documented per-event in the
SHOPLINE Open Platform docs.

## Event Payload Structure

Payloads are JSON representations of the affected resource. Order and product
payloads typically include an `id`, timestamps, and resource-specific fields:

```json
{
  "id": 123456789,
  "created_at": "2024-01-15T10:30:00+08:00",
  "updated_at": "2024-01-15T10:30:00+08:00"
}
```

Key headers included with each webhook:

| Header | Description |
|--------|-------------|
| `X-Shopline-Topic` | The webhook topic (e.g. `orders/create`) |
| `X-Shopline-Shop-Domain` | The store domain (e.g. `my-store.myshopline.com`) |
| `X-Shopline-Shop-Id` | The store ID |
| `X-Shopline-Merchant-Id` | The merchant ID |
| `X-Shopline-API-Version` | API version used for the payload (e.g. `v20230901`) |
| `X-Shopline-Hmac-Sha256` | HMAC-SHA256 signature for verification |
| `X-Shopline-Webhook-Id` | Delivery ID — **stable across retries**, use for idempotency |

## Delivery, Timeout, and Retries

- Your endpoint must respond with **HTTP 200** within **5 seconds**.
- On timeout or a non-2xx response, SHOPLINE retries up to **19 times over
  ~48 hours** with increasing intervals
  (0s, 5s, 10s, 30s, 45s, 1m, 2m, 5m, 12m, 38m, 1h, 2h, then nine 4-hour gaps).
- After 19 consecutive failures with no successful delivery, the **subscription
  is automatically removed** — so monitor your endpoint's health.

Because retries replay the same delivery, use the `X-Shopline-Webhook-Id` header
to process each event **idempotently**.

## Full Event Reference

For the complete list of webhook topics and payloads, see the
[SHOPLINE Webhooks overview](https://developer.shopline.com/docs/apps/api-instructions-for-use/webhooks/overview/).
