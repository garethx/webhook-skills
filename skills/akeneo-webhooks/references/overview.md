# Akeneo Webhooks Overview

## What Are Akeneo Webhooks?

Akeneo PIM's **Events API** lets your application receive real-time notifications
when products change in the PIM. You enable webhooks per **connection** in the PIM
connection settings and provide a single **Request URL**. Akeneo then POSTs event
notifications to that URL as products are created, updated, or removed.

Key characteristics:

- **Single endpoint for all events.** One connection has exactly one Request URL,
  and it receives **every** event type. Route/dispatch by the `action` field
  server-side.
- **Batched delivery.** Notifications arrive as a top-level `events` array — up to
  10 events per request (for example, when an app bulk-edits products through the
  REST API).
- **Fire-and-forget.** Akeneo does **not** retry. Undelivered events are dropped
  after ~2 hours. Delivery order is **not** guaranteed. Throughput can reach
  ~40,000 events/hour.
- **Fast acknowledgement required.** Respond with a 2xx in under ~500ms and process
  the events asynchronously (queue/worker), or you risk dropped events.

> This is the PIM **Events API** (available on PIM 5.0+ / SaaS). Akeneo markets it as
> deprecated in favor of the newer CloudEvents-based **Event Platform**, but it
> remains the webhook scheme most integrations (and Hookdeck) target.

## Common Event Types

Only product and product-model events exist in this API. Category and other
resource events are **not** available here (they live in the newer Event Platform).

| Event (`action`) | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `product.created` | A product is created | Sync new SKUs downstream, index for search |
| `product.updated` | A product is updated | Re-sync attributes, invalidate caches |
| `product.removed` | A product is deleted | Remove from storefront/catalog |
| `product_model.created` | A product model is created | Create parent/variant groupings |
| `product_model.updated` | A product model is updated | Re-sync model-level attributes |
| `product_model.removed` | A product model is deleted | Clean up variant groupings |

## Event Payload Structure

Every request body is a JSON object with an `events` array. Each element describes
one event:

```json
{
  "events": [
    {
      "action": "product.updated",
      "event_id": "6ad821cb-a5b2-4c9c-b1a8-8f6b2d2e4c11",
      "event_datetime": "2024-06-01T12:34:56+00:00",
      "author": "julia",
      "author_type": "ui",
      "pim_source": "https://demo.akeneo.com",
      "data": {
        "resource": {
          "identifier": "top-sku-001",
          "enabled": true,
          "family": "tshirts",
          "categories": ["summer_collection"],
          "values": {}
        }
      }
    }
  ]
}
```

Field reference:

| Field | Description |
|-------|-------------|
| `action` | Event type string (see table above) |
| `event_id` | Unique identifier for the event (use for idempotency) |
| `event_datetime` | ISO 8601 timestamp of when the event occurred |
| `author` | Username or connection that triggered the change |
| `author_type` | Origin of the change (`ui`, `api`, etc.) |
| `pim_source` | Base URL of the PIM instance that sent the event |
| `data.resource` | The affected product or product-model resource |

## Full Event Reference

For the complete list of events and payload details, see the
[Akeneo Events API documentation](https://api.akeneo.com/events-documentation/overview.html).
