# CloudSignal Webhooks Overview

## What Are CloudSignal Webhooks?

**CloudSignal** is the outbound webhook product of **Cloudprinter.com**, a
print-on-demand fulfilment network. As a print order and its items move through
production and shipping, Cloudprinter POSTs JSON **signals** to an endpoint you
register, so your app can track fulfilment state in real time instead of polling.

> **Disambiguation:** This is **Cloudprinter.com CloudSignal Webhooks v2.0**, not
> the unrelated `cloudsignal.io` MQTT/IoT platform.

## How Delivery Works

1. Cloudprinter POSTs a JSON signal to your registered HTTPS endpoint.
2. Every request carries a plaintext **Webhook API key** in the body's `apikey`
   field — this is how you authenticate the delivery (there is **no signature
   header/HMAC**). See [verification.md](verification.md).
3. Your endpoint validates the `apikey`, processes the signal, and returns
   **HTTP 200** (or 204).
4. If your endpoint returns anything other than 200/204 (or is unreachable),
   CloudSignal **retries — up to 100 attempts over 7 days**.

## Signal Types (`type`)

Nine signal types, case-sensitive PascalCase. The value is in the `type` field:

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `CloudprinterOrderValidated` | The order was received and validated | Mark order accepted, start tracking |
| `ItemValidated` | An item was validated by production | Update per-item status |
| `ItemProduce` | Production of an item started | Show "in production" to the customer |
| `ItemProduced` | Production of an item completed | Advance fulfilment state |
| `ItemPacked` | An item was packed | Prepare shipping notifications |
| `ItemShipped` | An item was dispatched | Store `tracking`, email the customer |
| `ItemError` | A production issue occurred | Alert your team, reprint, or refund |
| `ItemCanceled` | An item was canceled in production | Reconcile inventory, refund |
| `CloudprinterOrderCanceled` | The whole order was canceled | Cancel downstream processing, refund |

## Event Payload Structure

All signals share a common core, plus type-specific fields. A representative
`ItemShipped` signal:

```json
{
  "apikey": "13b3f8a9c2...",
  "type": "ItemShipped",
  "order": "73O1230A",
  "order_reference": "your-order-ref-123",
  "item": "73O1230A-1",
  "item_reference": "your-item-ref-1",
  "datetime": "2026-07-28 10:30:00",
  "tracking": "1Z999AA10123456784",
  "shipping_option": "standard"
}
```

Common fields:

| Field | Description |
|-------|-------------|
| `apikey` | Per-endpoint Webhook API key — authenticate against this (see [verification.md](verification.md)) |
| `type` | The signal type (see table above) |
| `order` | Cloudprinter order id |
| `order_reference` | Your reference passed when the order was created — key for matching |
| `item` | Cloudprinter item id (present on `Item*` signals) |
| `item_reference` | Your item reference — key for matching |
| `datetime` | When the signal was generated |

Type-specific fields:

| `type` | Extra fields |
|--------|--------------|
| `ItemShipped` | `tracking` (carrier tracking number), `shipping_option` |
| `ItemError` | `cause` (reason for the error; optional) |
| `ItemCanceled` | `cause` (reason for cancellation; optional) |

> Field availability can vary by product and configuration; treat type-specific
> fields defensively (they may be absent). Confirm details against the official
> docs linked below.

## Idempotency

CloudSignal may redeliver a signal (its retry policy is up to 100 attempts over
7 days). Deduplicate so the same signal is not actioned twice — a good key is
`(order, item, type, datetime)` or your own `item_reference` + `type`. See
[webhook-handler-patterns / idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Documentation

- [CloudSignal Webhooks v2.0](https://docs.cloudprinter.com/client/cloudsignal-webhooks-v2-0)
- [CloudSignal connected app (setup)](https://docs.cloudprinter.com/connected-apps/cloudsignal-webhooks/)
