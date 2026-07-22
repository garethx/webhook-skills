# TikTok Shop Webhooks Overview

## What Are TikTok Shop Webhooks?

TikTok Shop webhooks are HTTP POST notifications that TikTok Shop sends to your
application when events happen in a seller's shop — an order changes status, a
package is updated, a product's listing status changes, or a seller revokes your
app's authorization. Instead of polling the Order or Product APIs, you subscribe
to the event types you care about and receive them in near real time.

You subscribe to events **per shop** in Partner Center, or programmatically via
the Events API. All subscribed events for an app are delivered to a single
webhook URL, so your handler branches on the event to decide what to do.

## Delivery Semantics

- **At-least-once delivery.** The same event can arrive more than once. Dedupe on
  `tts_notification_id` before processing.
- **Retries.** If your endpoint does not return HTTP 200 within 3 seconds, TikTok
  retries **4 times** on a fixed schedule — **2 minutes, 30 minutes, 3 hours,
  12 hours** — then gives up. Missed events are not redelivered afterward, so
  reconcile periodically by polling the relevant APIs.
- **Endpoint requirements.** Public **HTTPS** on a domain (no IP address, no
  custom port), **TLS 1.2+**. Respond **200 with an empty body**; a **401**
  response tells TikTok the signature was rejected.

## The `type` Field Is Numeric — Branch on the Event Name

Each payload includes a numeric `type` field. TikTok does **not** formally
version these numeric codes, so treat them as unreliable and branch on the
resolved event **name** instead. The commonly-observed mapping for the core
events (confirm against your Partner Center subscriptions):

| `type` | Event name | Triggered When | Common Use Cases |
|--------|------------|----------------|------------------|
| `1` | `ORDER_STATUS_CHANGE` | An order moves to a new status | Fulfilment, order sync, notifications |
| `2` | `RECIPIENT_ADDRESS_UPDATE` | The buyer's shipping address changes | Update shipping labels, warehouse sync |
| `3` | `PACKAGE_UPDATE` | A package is combined, split, or updated | Re-fetch package, update tracking |
| `4` | `PRODUCT_STATUS_CHANGE` | Product audit/listing status changes | Sync catalog availability |
| `5` | `SELLER_DEAUTHORIZATION` | A seller revokes your app's authorization | Disable sync, purge stored tokens |

## Additional Subscribable Events

Beyond the core set above, TikTok Shop also offers (names as used in the Events
API / subscription config):

| Event name | Triggered When |
|------------|----------------|
| `RETURN_STATUS_CHANGE` | A return/refund request changes status |
| `CANCELLATION_STATUS_CHANGE` | An order cancellation changes status |
| `PRODUCT_INFORMATION_CHANGE` | Product title, description, images, or attributes change |
| `INVOICE_STATUS_CHANGE` | Invoice upload/processing status changes |

The example handlers in this skill dispatch on the five core events above and log
anything else for reconciliation. Add cases as you subscribe to more events.

## Event Payload Structure

Every webhook shares the same envelope:

```json
{
  "type": 1,
  "tts_notification_id": "7012345678901234567",
  "shop_id": "7009876543210987654",
  "timestamp": 1633174587,
  "data": {
    "order_id": "576908...",
    "order_status": "AWAITING_SHIPMENT",
    "update_time": 1633174586
  }
}
```

| Field | Description |
|-------|-------------|
| `type` | Numeric event type code (do not rely on it — resolve to a name) |
| `tts_notification_id` | Unique notification ID — use for idempotency/dedupe |
| `shop_id` | The shop the event belongs to |
| `timestamp` | Unix time (seconds) the event was generated |
| `data` | Event-specific payload (fields depend on the event) |

The `data` shape depends on the event. Treat webhooks as a **signal** and re-fetch
the authoritative record from the Order/Product API when you need full detail.

## Full Event Reference

For the complete, current list of events and payload fields, see the
[TikTok Shop Webhooks overview](https://partner.tiktokshop.com/docv2/page/tts-webhooks-overview)
in Partner Center (JavaScript-rendered; sign in with a developer account).
