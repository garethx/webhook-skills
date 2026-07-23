# Zendesk Webhooks Overview

## What Are Zendesk Webhooks?

A Zendesk webhook is an HTTP endpoint you own that Zendesk calls when something
happens in your account. Zendesk `POST`s a JSON payload to your URL so you can
react to changes — sync a ticket to another system, notify a chat channel, kick
off automation — without polling the API.

Zendesk webhooks operate in one of **two mutually exclusive models**:

### 1. Event subscriptions

The webhook subscribes to one or more `zen:event-type:*` events. Zendesk delivers
a **CloudEvents-style envelope** with a `type` field describing what happened. You
dispatch on `type`. Events span several domains:

- **Ticket** — `zen:event-type:ticket.*`
- **User** — `zen:event-type:user.*`
- **Organization** — `zen:event-type:organization.*`
- **Article** — `zen:event-type:article.*` (Help Center)
- **Community post** — `zen:event-type:community_post.*`
- **Agent availability** — `zen:event-type:agent.*`

### 2. Connected to a trigger or automation

The webhook is connected to a Zendesk **trigger** (runs on ticket events in real
time) or **automation** (runs on a time-based schedule). The payload is **custom
JSON you define** in the trigger/automation action using placeholders — there is
no `type` field. Dispatch logic is up to your payload design.

> A single webhook **cannot** both subscribe to events and be connected to a
> trigger/automation. Choose one model per webhook.

## Common Event Types (event subscriptions)

| Event `type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `zen:event-type:ticket.created` | A ticket is created | Sync to CRM, alert on-call, log intake |
| `zen:event-type:ticket.status_changed` | A ticket's status changes | Update dashboards, SLA tracking |
| `zen:event-type:ticket.comment_added` | A comment is added to a ticket | Mirror to chat, notify watchers |
| `zen:event-type:ticket.priority_changed` | A ticket's priority changes | Escalation routing |
| `zen:event-type:ticket.agent_assignment_changed` | A ticket's assignee changes | Notify the new agent |
| `zen:event-type:user.created` | A user is created | Provision accounts, welcome flows |
| `zen:event-type:organization.created` | An organization is created | Sync accounts to billing/CRM |

## Event Payload Structure (event subscriptions)

Event-subscription payloads follow the CloudEvents spec. Key top-level fields:

```json
{
  "type": "zen:event-type:ticket.created",
  "account_id": 123456,
  "id": "01H...",
  "time": "2026-07-22T10:00:00Z",
  "subject": "zen:ticket:35436",
  "detail": { "id": "35436", "status": "new", "...": "..." },
  "event": { "...": "event-specific fields" }
}
```

- `type` — the event type string you dispatch on
- `subject` — the resource affected (e.g. `zen:ticket:35436`)
- `detail` — a snapshot of the resource
- `event` — the change-specific data (varies by event type)

## Full Event Reference

For the complete, authoritative list of events, see
[Zendesk webhook event types](https://developer.zendesk.com/api-reference/webhooks/event-types/webhook-event-types/).
