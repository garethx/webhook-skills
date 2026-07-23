# Attentive Webhooks Overview

## What Are Attentive Webhooks?

[Attentive](https://www.attentive.com/) is an SMS and email marketing platform.
Webhooks let Attentive push real-time events — subscriber opt-ins/opt-outs,
message sends, opens, link clicks, and custom attribute changes — to an HTTPS
endpoint you control, so you can sync subscriber state, trigger downstream
automations, or update your CRM as events happen.

Attentive supports two webhook flavors that deliver the **same event payloads**:

- **Universal webhooks** — configured in the Attentive dashboard under a custom
  app's **Webhooks** tab. One endpoint receives all selected event types.
- **Subscription webhooks** — created programmatically via the Webhooks API
  (`POST /webhooks`). Each subscription targets specific event types.

Both sign requests with the same `x-attentive-hmac-sha256` header.

## Common Event Types

The event name is delivered in the payload's `type` field (there is no
event-type header). Verify exact strings against the
[official docs](https://docs.attentive.com/docs/create-and-manage-webhooks).

### SMS events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sms.subscribed` | Subscriber joins an SMS list | Sync opt-in state, welcome flows |
| `sms.unsubscribed` | Subscriber opts out of SMS | Suppress sends, update CRM consent |
| `sms.sent` | An SMS is sent to a subscriber | Analytics, delivery logging |
| `sms.inbound_message` | Subscriber replies via SMS | Support routing, keyword automations |
| `sms.message_link_click` | Subscriber clicks an SMS link | Attribution, engagement scoring |

### Email events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `email.subscribed` | Subscriber joins an email list | Sync opt-in state |
| `email.unsubscribed` | Subscriber opts out of email | Suppress sends, update consent |
| `email.sent` | An email is sent to a subscriber | Delivery logging |
| `email.opened` | Subscriber opens an email | Engagement scoring, re-targeting |
| `email.message_link_click` | Subscriber clicks an email link | Attribution, engagement scoring |

### Custom attribute events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `custom_attribute.set` | A custom attribute is set on a subscriber | Sync enriched data to your systems |

## Event Payload Structure

Payloads are JSON with a common envelope:

```json
{
  "type": "sms.subscribed",
  "timestamp": 1721664000000,
  "company": { "id": "..." },
  "subscriber": {
    "phone": "+15555550123",
    "email": "user@example.com"
  }
}
```

- `type` — the event type string (e.g. `sms.subscribed`)
- `timestamp` — Unix time in **milliseconds**
- `company` — the Attentive company (brand) the event belongs to
- `subscriber` — subscriber identifiers and event-specific detail (fields vary
  by event type)

## Delivery Behavior

- **Retries:** Attentive retries non-2xx responses with exponential backoff for
  up to **3 days**. Endpoints that fail for multiple consecutive days are
  automatically disabled.
- **Ordering:** Event order is **not guaranteed** — do not assume the sequence
  in which events arrive. Handle events idempotently.
- **Timeout:** The delivery timeout is not documented; acknowledge fast (return
  2xx) and do heavy work asynchronously.

## Full Event Reference

For the complete list of events and payloads, see
[Attentive: Create and manage webhooks](https://docs.attentive.com/docs/create-and-manage-webhooks).
