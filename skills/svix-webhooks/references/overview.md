# Svix Webhooks Overview

## What Are Svix Webhooks?

[Svix](https://www.svix.com/) is webhook-sending infrastructure. Many services
("powered by Svix") use it to deliver their outbound webhooks. A webhook is a
`POST` request Svix sends to your endpoint when an event occurs in the upstream
service. Every request is signed so you can verify it is authentic and was not
tampered with or replayed.

Svix implements the [Standard Webhooks](https://www.standardwebhooks.com/) spec.
The verification scheme in this skill therefore applies to **any** sender that
delivers via Svix or Standard Webhooks — the headers and signature format are the
same across senders.

## The Event Envelope

Svix transports whatever payload the upstream service defines. There is **no
fixed Svix event catalog** — the sender owns the event names. The near-universal
convention is a JSON envelope:

```json
{
  "type": "invoice.paid",
  "data": {
    "id": "in_1a2b3c",
    "...": "sender-defined fields"
  }
}
```

- `type` — the event name (e.g. `invoice.paid`, `user.created`). Dot-delimited by convention, but the sender decides.
- `data` — the event-specific payload.

Some senders wrap or extend this (extra top-level fields, `timestamp`, etc.), so
read from `type`/`data` defensively and always keep a `default` branch for
unknown event types.

## Common Event Types (Illustrative)

Because events are sender-defined, treat this table as an example of the
convention, not an exhaustive list. Look up the real events in your sender's
Svix App Portal or their documentation.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `invoice.paid` | An invoice is paid | Fulfilment, receipts, unlock access |
| `user.created` | A new user/account is created | Provision resources, welcome email |
| `user.updated` | A user record changes | Sync profile to your database |
| `message.sent` | A message/notification is dispatched | Update delivery status, analytics |

## Svix Operational Webhooks

Svix itself can send [Operational Webhooks](https://docs.svix.com/incoming-webhooks)
about your webhook infrastructure, using this same signing scheme. These have
concrete, Svix-defined names, for example:

| Event | Triggered When |
|-------|----------------|
| `endpoint.disabled` | Svix auto-disables a failing endpoint |
| `endpoint.created` / `endpoint.updated` / `endpoint.deleted` | An endpoint changes |
| `message.attempt.exhausted` | All delivery retries for a message failed |
| `message.attempt.failing` | A message attempt is failing |
| `message.attempt.recovered` | A previously failing endpoint recovered |
| `background_task.finished` | A background task completed |

## Delivery Expectations

- Return a `2xx` (200–299) response within Svix's timeout (~15s) to acknowledge receipt.
- Non-2xx responses (or timeouts) are retried with exponential backoff.
- Use the `svix-id` header as an idempotency key — the same message may be delivered more than once.

## Full Event Reference

Events are defined by the upstream sender. For the receiving-side scheme and the
list of Svix operational webhooks, see the
[Svix receiving documentation](https://docs.svix.com/receiving/introduction).
