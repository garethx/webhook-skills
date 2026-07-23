# Pipedrive Webhooks Overview

## What Are Pipedrive Webhooks?

Pipedrive webhooks push real-time notifications to your endpoint whenever an
object in a Pipedrive account changes — a deal is created, a person is updated,
an activity is deleted, and so on. Instead of polling the Pipedrive API, you
register a `subscription_url` and Pipedrive `POST`s a JSON payload to it on each
matching change.

This skill targets **Webhooks v2**, the default version since March 17, 2025.

## How Are They Secured?

Pipedrive webhooks are **not signed**. There is no HMAC, no signature header, and
they are **not** Standard Webhooks compliant. Authentication is **HTTP Basic
Auth** only:

- When you create the webhook you optionally set `http_auth_user` and
  `http_auth_password`.
- Pipedrive then sends `Authorization: Basic <base64(user:password)>` on every
  delivery.
- Your endpoint verifies those credentials and must be served over **HTTPS**
  (self-signed certificates are not supported).

See [verification.md](verification.md) for implementation details.

## Event Format: `action.entity`

A v2 event type is composed of an **action** and an **entity**, joined by a dot,
e.g. `create.deal`, `change.person`, `delete.activity`.

The payload does **not** include the combined string — build it yourself from the
`meta` block: `` `${meta.action}.${meta.entity}` ``.

### Actions

| Action | Meaning |
|--------|---------|
| `create` | Object created |
| `change` | Object updated |
| `delete` | Object deleted |
| `*` | Wildcard — subscribe to all actions |

### Entities (event objects)

`activity`, `deal`, `lead`, `note`, `organization`, `person`, `pipeline`,
`product`, `stage`, `user`, and additional objects such as `board`,
`deal_product`, `phase`, `project`, `task`. Use `*` to subscribe to all entities.

> `lead` was added in Webhooks v2.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `create.deal` | A deal is created | Sync new deals to your data warehouse, notify sales |
| `change.deal` | A deal is updated | React to stage/value/owner changes, update forecasts |
| `delete.deal` | A deal is deleted | Remove records, audit trails |
| `change.person` | A contact is updated | Keep contact records in sync |
| `create.activity` | An activity is created | Trigger reminders, calendar sync |

## Event Payload Structure

```json
{
  "meta": {
    "action": "change",
    "entity": "deal",
    "entity_id": "123",
    "company_id": 456,
    "user_id": 789,
    "id": "correlation-uuid",
    "correlation_id": "correlation-uuid",
    "version": "2.0",
    "webhook_id": "1",
    "timestamp": "2026-01-01T12:00:00.000Z",
    "attempt": 1
  },
  "data": { "id": 123, "title": "New deal", "value": 500, "stage_id": 2 },
  "previous": { "value": 300, "stage_id": 1 }
}
```

- **`meta`** — metadata about the event: `action`, `entity`, `entity_id`,
  `company_id`, `user_id`, `correlation_id`, `version`, `webhook_id`,
  `timestamp`, `attempt`, and more.
- **`data`** — the current state of the object. `null` on `delete`.
- **`previous`** — on `change`, only the fields that changed (with their old
  values); on `delete`, the last known state; `null` on `create`.

## Delivery, Retries, and Bans

- **Success** = any `2XX` response. Return `200` promptly (do heavy work async).
- **Retries** — on failure, Pipedrive retries after **3s, 30s, and 150s** (up to
  **4 attempts** total). Handle deliveries **idempotently** using
  `meta.correlation_id`.
- **Bans** — repeated first-attempt failures increment a ban counter; at **10
  bans** the webhook is suspended for **30 minutes**.
- **Auto-delete** — if there are **no successful deliveries for 3 consecutive
  days**, Pipedrive deletes the webhook.

## Full Event Reference

For the complete guide, see [Pipedrive's Webhooks v2 documentation](https://pipedrive.readme.io/docs/guide-for-webhooks-v2)
and the [Webhooks API reference](https://developers.pipedrive.com/docs/api/v1/Webhooks).
