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

Each payload includes a numeric `type` field. Per the official docs, the full
`event_type` enum is published but **a complete numeric `type` mapping is
not**: *"Do not branch only on the numeric type; use the subscribed event_type
context and the topic-specific payload schema."* Only `type: 1`
(ORDER_STATUS_CHANGE) appears in the official sample payload. Since each
subscription pairs one `event_type` with one callback URL, registering a
distinct path per topic is the most reliable way to know which event arrived.

Full topic catalog (from the official webhook topic quick reference):

| `event_type` | Triggered When |
|--------------|----------------|
| `ORDER_STATUS_CHANGE` | An order is created or its status changes |
| `RECIPIENT_ADDRESS_UPDATE` | The recipient address of an order is updated |
| `PACKAGE_UPDATE` | A package is combined, split, or changed (e.g. address updates) |
| `PRODUCT_STATUS_CHANGE` | Product audit results are updated |
| `SELLER_DEAUTHORIZATION` | A seller revokes or loses authorization for the app |
| `UPCOMING_AUTHORIZATION_EXPIRATION` | Sent 30 days before authorization expiry, then daily at 00:00 |
| `CANCELLATION_STATUS_CHANGE` | An order cancellation status changes |
| `RETURN_STATUS_CHANGE` | An order return status changes |
| `REVERSE_STATUS_UPDATE` | A buyer raises a cancellation/refund/return needing seller action |
| `NEW_CONVERSATION` | A customer-service agent joins or leaves a conversation |
| `NEW_MESSAGE` | A new message is sent in a customer-service conversation |
| `NEW_MESSAGE_LISTENER` | A creator sends a message to the seller |
| `PRODUCT_INFORMATION_CHANGE` | Product title, description, images, or attributes go live |
| `PRODUCT_CREATION` | A new product is created |
| `PRODUCT_CATEGORY_CHANGE` | A product category is changed |
| `PRODUCT_AUDIT_STATUS_CHANGE` | The product audit status changes |
| `INVOICE_STATUS_CHANGE` | Invoice upload status changes (Upload Invoice endpoint) |

The example handlers dispatch on the topics the developer has mapped from
their own subscriptions and log anything else for reconciliation. Apps that
need long-lived shop access should subscribe to both
`UPCOMING_AUTHORIZATION_EXPIRATION` and `SELLER_DEAUTHORIZATION`.

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
