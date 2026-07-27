# Favro Webhooks Overview

## What Are Favro Webhooks?

Favro webhooks let your application react to changes on a Favro board in real
time. Each webhook is attached to a board/widget and POSTs a JSON payload to your
endpoint (`postToUrl`) whenever a subscribed change happens — a card is created,
moved, updated, or deleted, or a comment changes. Every delivery is signed so you
can confirm it genuinely came from Favro (see
[verification.md](verification.md)).

Webhooks are created either through Favro's UI automations or via the
`POST create-webhook` API with `name`, `widgetCommonId`, `postToUrl`, and
`secret`. When a webhook is created Favro immediately sends a **ping** to confirm
the endpoint is reachable and correctly configured.

## Common Event Types

Every payload has a top-level `action` string. Favro reuses the same `action`
values across object types (a card and a comment can both be `created`), so the
object type is inferred from which object the payload carries: `card`, `comment`,
or `hook` (for the ping). Handlers in this skill dispatch on the combined
**`<type>.<action>`** key.

| Event | `action` | Object | Triggered When | Common Use Cases |
|-------|----------|--------|----------------|------------------|
| `ping` | `ping` | `hook` | Webhook created | Validate the endpoint during setup (return 2xx) |
| `card.created` | `created` | `card` | A card is created | Sync tasks, create mirror records |
| `card.committed` | `committed` | `card` | A card is committed to a board | Kick off work, notify assignees |
| `card.moved` | `moved` | `card` | A card moves column/board | Trigger stage automations, status sync |
| `card.updated` | `updated` | `card` | A card's fields change | Keep external records in sync |
| `card.deleted` | `deleted` | `card` | A card is deleted | Clean up mirror records |
| `comment.created` | `created` | `comment` | A comment is added | Notifications, activity feeds |
| `comment.updated` | `updated` | `comment` | A comment is edited | Sync edited content |
| `comment.deleted` | `deleted` | `comment` | A comment is deleted | Clean up mirror records |

## Event Payload Structure

All payloads share a top-level envelope:

```json
{
  "payloadId": "AbCdEf012345==",
  "action": "created",
  "hookId": "5c1a...",
  "card": {
    "cardId": "…",
    "cardCommonId": "…",
    "name": "Implement webhook receiver",
    "columnId": "…",
    "...": "…"
  }
}
```

Key fields:

- **`payloadId`** — a base64 string unique to this delivery. It is the value
  concatenated with your webhook URL to produce the signature, and a good
  idempotency key.
- **`action`** — one of `ping`, `created`, `committed`, `moved`, `updated`,
  `deleted`.
- **`hookId`** — the id of the webhook that produced this delivery.
- **`card` / `comment` / `hook`** — the changed object. The ping carries
  `hook: { "url": "<postToUrl>" }`.

### The Ping Payload

```json
{
  "payloadId": "AbCdEf==",
  "action": "ping",
  "hookId": "abc123",
  "hook": { "url": "https://example.com/webhooks/favro" }
}
```

## Partial Data Caveat

**Webhooks triggered by Favro UI automations send partial data with no
pre-update state.** Do not assume every field is present, and do not rely on a
"before" snapshot. When you need the complete, current record, fetch the card
from the Favro API using its id rather than trusting the webhook payload alone.

## Retry Behavior

Favro's retry behavior for failed deliveries is **not documented**. Assume a
delivery *may* be retried and make your handler idempotent — deduplicate on
`payloadId`. Always return a `2xx` quickly and do slow work asynchronously.

## Full Event Reference

For the complete, authoritative list of events and payloads, see the
[Favro developer documentation](https://favro.com/developer/).
