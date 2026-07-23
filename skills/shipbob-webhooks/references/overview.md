# ShipBob Webhooks Overview

## What Are ShipBob Webhooks?

ShipBob is a fulfillment platform. Webhooks let ShipBob push near real-time
notifications to your application as orders are shipped and delivered, tracking
updates arrive, returns are created, inbound inventory (Warehouse Receiving
Orders) moves through the warehouse, and billing charges are generated — so you
don't have to poll the API.

Each webhook is an HTTP `POST` to a URL you register. ShipBob signs every request
using the [Standard Webhooks](https://www.standardwebhooks.com/) scheme and puts
the event **topic** in an `x-webhook-topic` header.

## How the Receiver Identifies the Event

The topic is **not** in the JSON body — it is in the HTTP header:

```
x-webhook-topic: order.shipped
```

Dispatch your handler off `x-webhook-topic`, then parse the (already verified)
raw body for the event-specific payload.

> Legacy API versions (1.0 / 2.0) used a `shipbob-topic` header with underscore
> topic names (e.g. `order_shipped`). The current 2026-01 API uses `x-webhook-topic`
> with dotted names.

## Common Event Types

| Topic | Triggered When | Common Use Cases | Read scope |
|-------|----------------|------------------|------------|
| `order.shipped` | An order's shipment ships | Notify customer, mark order shipped | `orders_read` / `fulfillments_read` |
| `order.shipment.delivered` | A shipment is delivered | Trigger review request, close order | `orders_read` / `fulfillments_read` |
| `order.shipment.tracking.updated` | Tracking number/carrier/status changes | Update tracking UI | `orders_read` / `fulfillments_read` |
| `order.shipment.exception` | A shipment hits a delivery exception | Alert support, flag for follow-up | `orders_read` / `fulfillments_read` |
| `order.shipment.on_hold` | A shipment is placed on hold | Investigate hold reason | `orders_read` / `fulfillments_read` |
| `order.shipment.cancelled` | A shipment is cancelled | Reverse fulfillment, refund | `orders_read` / `fulfillments_read` |
| `return.created` | A return is created | Start RMA workflow | `returns_read` |
| `wro.created` | A Warehouse Receiving Order is created | Track inbound inventory | `receiving_read` |
| `billing.charge.created` | A billing charge is created | Reconcile invoices | `billing_read` |

This is a representative subset. ShipBob also emits additional order shipment,
return, WRO (`wro.box.arrived`, `wro.box.scanned`, `wro.box.stowed`), and billing
topics.

## Event Payload Structure

ShipBob does not publish a fixed schema per topic. Payloads are **event-specific**
JSON. The authoritative way to see the exact shape of each payload is to create a
webhook subscription in the ShipBob Dashboard and use the **"Send example"**
feature to preview real payloads.

Common characteristics:

- The body is JSON describing the resource the topic refers to (an order shipment,
  a return, a WRO, a charge, etc.).
- Identify the event kind from the `x-webhook-topic` header, **not** from a `type`
  field in the body.
- Store the `webhook-id` header value for idempotency — ShipBob retries on failure
  and the same `webhook-id` may be delivered more than once.

## Retry Behavior

If your endpoint does not return a `2xx` within ~15 seconds, ShipBob retries on an
escalating schedule: immediately, then 5s, 5m, 30m, 2h, 5h, 10h, 10h. After all
retries are exhausted the message is marked failed and account owners are emailed.
An endpoint that keeps failing over a ~5 day window is automatically disabled.

## Full Event Reference

For the complete list of topics and payloads, see
[ShipBob's webhook documentation](https://developer.shipbob.com/2026-01/webhooks).
