# Nylas Webhooks Overview

## What Are Nylas Webhooks?

[Nylas](https://developer.nylas.com/docs/v3/notifications/webhooks/) delivers real-time
notifications about email, calendar, and contact activity across the accounts (grants)
connected to your application. Instead of polling the Email, Calendar, or Contacts APIs,
you register a **webhook destination** (an HTTPS URL) and subscribe it to one or more
**triggers**. When a matching change happens on any grant, Nylas POSTs a notification to
your endpoint.

Each webhook destination has its own **`webhook_secret`**, used to sign every request so
you can verify the notification actually came from Nylas.

## CloudEvents 1.0 Payloads

Nylas webhook payloads follow the **[CloudEvents 1.0](https://cloudevents.io/)**
specification — this is **not** Standard Webhooks. The trigger name is in the top-level
`type` field, and the changed resource lives under `data.object`.

```json
{
  "specversion": "1.0",
  "type": "message.created",
  "source": "/google/emails/realtime",
  "id": "5b3c1f2e-...-9a8b",
  "time": 1700000000,
  "webhook_delivery_attempt": 1,
  "data": {
    "application_id": "APPLICATION_ID",
    "grant_id": "GRANT_ID",
    "object": {
      "id": "MESSAGE_ID",
      "subject": "Welcome",
      "from": [{ "email": "sender@example.com" }]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `specversion` | Always `"1.0"` (CloudEvents version) |
| `type` | The trigger, e.g. `message.created` |
| `source` | Origin path of the event, e.g. `/google/emails/realtime` |
| `id` | Unique notification ID — use it for **idempotency / dedupe** |
| `time` | Unix timestamp when the event occurred |
| `webhook_delivery_attempt` | Delivery attempt number (1–3) |
| `data.application_id` | Your Nylas application ID |
| `data.grant_id` | The grant (connected account) the change belongs to |
| `data.object` | The changed resource (message, event, grant, etc.) |

## Common Event Types

| Trigger (`type`) | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `message.created` | A new email is received on the grant | Inbox automation, notifications, parsing |
| `message.updated` | A message changes (read state, folder) | Sync read/unread, folder moves |
| `message.opened` | A tracked outbound message is opened | Open tracking, engagement analytics |
| `message.link_clicked` | A tracked link in a message is clicked | Click tracking, analytics |
| `message.bounce_detected` | An outbound message bounces | Suppression lists, deliverability alerts |
| `event.created` | A calendar event is created | Sync bookings, availability |
| `event.updated` | A calendar event is updated | Reschedule handling, reminders |
| `event.deleted` | A calendar event is deleted | Cancellation handling |
| `calendar.created` / `calendar.updated` / `calendar.deleted` | A calendar is created/updated/deleted | Calendar list sync |
| `grant.created` | A grant is created (account connected) | Provision user, initial sync |
| `grant.updated` | A grant is updated | Re-sync on scope change |
| `grant.expired` | A grant's credentials expire | Prompt user to re-authenticate |
| `grant.deleted` | A grant is deleted (account disconnected) | Deprovision, cleanup |
| `contact.updated` / `contact.deleted` | A contact changes | CRM sync |
| `folder.created` / `folder.updated` / `folder.deleted` | A folder/label changes | Folder mapping |
| `thread.replied` | A thread receives a reply | Conversation tracking |

## Full Event Reference

For the complete, authoritative list of triggers and their `data.object` schemas, see the
[Nylas notification schemas](https://developer.nylas.com/docs/v3/notifications/notification-schemas/)
documentation.

## Delivery & Retries

- Nylas retries **only** on temporary errors: `408`, `429`, `502`, `503`, `504`, `507`.
- On those, it makes **2 retries (3 attempts total)** with exponential backoff; the last
  attempt lands **10–20 minutes** after the first.
- Any other non-2xx (e.g. `400`, `401`, `500`) is **not** retried.
- If **95% of responses are non-200 over a 15-minute window**, the webhook is marked
  **failing**. After **72 hours** of that state it is marked **failed** and must be
  **manually reactivated** in the Dashboard.

Return `200` quickly (acknowledge, then process asynchronously) to stay healthy.
