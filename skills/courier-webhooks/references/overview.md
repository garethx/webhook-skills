# Courier Webhooks Overview

## What Are Courier Webhooks?

[Courier](https://www.courier.com/) is a notification infrastructure platform for
sending messages across email, SMS, push, chat, and in-app channels. Courier
**outbound webhooks** push real-time events to your endpoint as messages move through
their lifecycle and as audiences change — so you can sync delivery status, trigger
downstream automation, or feed analytics without polling the Courier API.

Every outbound webhook is a `POST` request with a JSON body and a `courier-signature`
header you use to verify the request is genuinely from Courier.

## Event Payload Structure

All events share a consistent envelope with two top-level properties:

```json
{
  "type": "message:updated",
  "data": {
    "...": "event-specific fields"
  }
}
```

- `type` — the event name (colon-delimited, e.g. `message:updated`)
- `data` — an object with the fields relevant to that event

Your handler should switch on `type` and read details from `data`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message:updated` | A message's delivery status changes | Sync delivery/open state, retry logic, analytics |
| `notification:submitted` | A notification is submitted for sending | Audit trail, track sends in flight |
| `notification:submission_canceled` | A submitted notification is canceled | Reconcile canceled sends |
| `notification:published` | A notification template is published | Invalidate caches, sync template versions |
| `audiences:updated` | An audience definition is updated | Sync segment definitions |
| `audiences:user:matched` | A user starts matching an audience | Trigger onboarding, tag users |
| `audiences:user:unmatched` | A user stops matching an audience | Revoke access, update CRM |
| `audiences:calculated` | An audience membership recalculation completes | Kick off downstream jobs |

## Important: No Per-Status Message Events

Courier does **not** emit separate events for each delivery status. There is no
`message:delivered`, `message:opened`, or `message:clicked` event. Instead, a single
`message:updated` event fires whenever a message's status changes, and the current
`status` plus relevant timestamps are carried inside `data`. Inspect `data.status`
(e.g. `DELIVERED`, `OPENED`, `CLICKED`, `UNDELIVERABLE`) to react to specific states.

## Environment Scoping

Webhooks are **scoped to the environment where they are created**. A webhook created in
the test environment receives only test events; a webhook created in production receives
only production events. Configure a webhook in each environment you want to monitor.

## Delivery and Response

Send a `2xx` (typically `200`) response to Courier as quickly as possible, and defer any
heavy processing to an asynchronous background job or queue. Courier's retry behavior for
non-`2xx` responses is not documented, so treat delivery as at-least-once and make your
handler idempotent.

## Full Event Reference

For the complete list of events and payloads, see
[Courier's Outbound Webhooks documentation](https://www.courier.com/docs/platform/workspaces/outbound-webhooks).
