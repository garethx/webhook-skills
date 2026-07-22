# Front Webhooks Overview

## What Are Front Webhooks?

Front sends webhooks to notify your application about activity in a shared inbox —
messages arriving or being sent, conversations being assigned, moved, tagged, archived,
or commented on. Instead of polling the Front API, your endpoint receives an HTTP POST
with a JSON payload each time a matching event occurs.

Front has **two** webhook systems. This skill covers **application webhooks** (the modern
system used by partner / Core API apps):

- **Application webhooks** — configured on a Front app. Signed with HMAC-SHA256 in the
  `X-Front-Signature` header, include an `X-Front-Request-Timestamp`, use an
  `X-Front-Challenge` subscription handshake, retry up to 3 times, and auto-disable after
  repeated failures. **This is what the examples in this skill implement.**
- **Rule webhooks** (legacy) — configured as a rule action in inbox settings. Signed with
  **HMAC-SHA1** (base64) over the body only, keyed with the "API Secret" from the Webhooks
  app, 5s timeout, **no retries**. Do not conflate the two schemes.

## Common Event Types

The event name is delivered in the top-level `type` field of the payload.

| Event `type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `inbound` | Inbound message received | Auto-triage, CRM sync, alerting |
| `outbound` | Outbound message sent | Logging replies, SLA tracking |
| `move` | Conversation moved to another inbox | Routing analytics, notifications |
| `assign` | Conversation assigned to a teammate | Workload tracking, escalation |
| `unassign` | Conversation unassigned | Workload tracking |
| `archive` | Conversation archived | Close-out workflows, metrics |
| `reopen` | Conversation reopened | Reopen alerts |
| `tag` | Tag added to a conversation | Categorization, automation |
| `untag` | Tag removed from a conversation | Categorization |
| `comment` | Teammate comments on a conversation | Internal collaboration hooks |
| `mention` | Teammate mentioned in a comment | Notifications |
| `message_bounce_error` | Outbound message bounced / delivery failed | Bounce handling, list hygiene |

Front webhooks **exclude** "mass action" events such as moving all inbox content to
another team, mass status updates, or importing historical messages.

## Event Payload Structure

Application webhook payloads share a common envelope:

```json
{
  "type": "inbound",
  "payload": {
    "id": "evt_55c8c149",
    "type": "inbound",
    "emitted_at": 1615496636.24,
    "_links": { "self": "https://api2.frontapp.com/events/evt_55c8c149" },
    "conversation": {
      "id": "cnv_55c8c149",
      "subject": "Re: Order #1234",
      "status": "unassigned",
      "_links": { "self": "https://api2.frontapp.com/conversations/cnv_55c8c149" }
    },
    "source": { "_meta": { "type": "inboxes" }, "data": [] },
    "target": { "_meta": { "type": "message" }, "data": { "id": "msg_..." } }
  }
}
```

Key fields:

- **`type`** — the event name your handler switches on (`inbound`, `move`, `assign`, …).
- **`payload.id`** — unique event id; use it for idempotency / deduplication.
- **`payload.emitted_at`** — when the event fired (epoch seconds).
- **`payload.conversation`** — the conversation the event relates to.
- **`payload.source`** — who/what caused the event (teammate, rule, inbox).
- **`payload.target`** — what changed (message, tag, teammate, comment, …).

> Exact envelope shape can vary by app configuration — always read `type` from the level
> your app receives and treat other fields defensively.

## Full Event Reference

- [Front Webhooks](https://dev.frontapp.com/docs/webhooks-1)
- [Front Events](https://dev.frontapp.com/reference/events)
