# Telnyx Webhooks Overview

## What Are Telnyx Webhooks?

Telnyx sends webhooks to notify your application about events across its products —
messaging (SMS/MMS), voice / Call Control, Verify, number orders, and more. When an event
occurs, Telnyx makes an HTTP `POST` to the webhook URL you configured, with a JSON body
describing the event.

This skill focuses on **messaging webhooks**, but the signing scheme (Ed25519, described in
[verification.md](verification.md)) is identical across all Telnyx products — only the
`event_type` values and `payload` shape differ.

Telnyx has two webhook API versions, configured per messaging profile / connection:

- **v2 (recommended, signed)** — every request carries an Ed25519 signature in the
  `telnyx-signature-ed25519` and `telnyx-timestamp` headers. This skill targets v2.
- **v1 (legacy, unsigned)** — no signature headers. Avoid for new integrations.

## Common Event Types (Messaging)

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | An inbound SMS/MMS arrives on one of your Telnyx numbers | Auto-replies, support routing, keyword handling (STOP/HELP) |
| `message.sent` | An outbound message is accepted by the carrier | Mark message as sent, start delivery tracking |
| `message.finalized` | A message reaches a terminal delivery state | Update status to delivered/failed, retry or alert on failure |

> Other Telnyx products emit their own event types over the same signed transport — for
> example Call Control emits `call.initiated`, `call.answered`, `call.hangup`, etc. Verify
> the exact event names for those products in the Telnyx docs.

## Event Payload Structure

Every Telnyx webhook is wrapped in a `data` envelope:

```json
{
  "data": {
    "record_type": "event",
    "event_type": "message.finalized",
    "id": "2c60c1c6-1234-4b6a-9f3f-abcdef012345",
    "occurred_at": "2024-02-02T22:25:27.521Z",
    "payload": {
      "id": "40385f64-1234-4b0e-8c1f-0123456789ab",
      "record_type": "message",
      "direction": "outbound",
      "from": { "phone_number": "+13125550001", "carrier": "Telnyx" },
      "to": [
        { "phone_number": "+13125550002", "status": "delivered", "carrier": "Verizon" }
      ],
      "text": "Hello from Telnyx",
      "type": "SMS",
      "completed_at": "2024-02-02T22:25:28.000Z"
    }
  },
  "meta": {
    "attempt": 1,
    "delivered_to": "https://example.com/webhooks/telnyx"
  }
}
```

Key fields:

- `data.event_type` — the event name you switch on (e.g. `message.sent`).
- `data.id` — unique event ID. Use it for **idempotency** (Telnyx retries and replays deliver
  the same event more than once).
- `data.occurred_at` — ISO 8601 timestamp of when the event occurred.
- `data.payload` — the resource that changed (the message object for messaging events).
- `meta.attempt` — which delivery attempt this is (1 for the first).

## Delivery, Timeouts & Retries

- Your endpoint must return a **2xx within 2000ms** or the delivery is considered failed.
- Failed deliveries are retried with exponential backoff (up to ~6 attempts), then Telnyx
  fails over to the configured **failover URL**.
- Because of retries, always process events **idempotently** using `data.id`.

## Full Event Reference

For the complete list of events and payload fields, see
[Telnyx: Receiving webhooks](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks).
