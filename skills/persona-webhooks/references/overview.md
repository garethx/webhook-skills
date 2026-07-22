# Persona Webhooks Overview

## What Are Persona Webhooks?

[Persona](https://withpersona.com) is an identity verification platform. Webhooks
let Persona notify your backend the moment something happens in an identity flow —
an inquiry is completed, a verification passes, an account is created, a case is
resolved — so you don't have to poll the API.

Persona sends an HTTP `POST` to your endpoint for every subscribed event, signed
with the `Persona-Signature` header so you can confirm it genuinely came from
Persona.

## How Delivery Works

- **Success codes:** Persona treats `200`, `201`, `202`, and `204` as success.
  Any other status (or a timeout) is retried.
- **Retries:** The first response has a **5 second** timeout. On failure Persona
  retries up to **7 more times** with exponential backoff (roughly 3s, 64s, 729s,
  4096s, 15625s, 46656s, 117649s between attempts).
- **Ordering is NOT guaranteed.** Events can arrive out of sequence. Order by
  `data.attributes.created-at` if sequence matters.
- **Duplicates are possible.** Process idempotently, keyed on `data.id`.
- **Retention:** Events are retained for **30 days** and can be manually redelivered
  from the Dashboard (Webhooks → Recent events → Resend).

## Payload Structure (JSON:API)

Persona payloads follow the [JSON:API](https://jsonapi.org/) spec. The webhook
envelope wraps the event; the affected object is nested inside.

```json
{
  "data": {
    "type": "event",
    "id": "evt_abc123",
    "attributes": {
      "name": "inquiry.completed",
      "created-at": "2026-07-22T12:00:00.000Z",
      "payload": {
        "data": {
          "type": "inquiry",
          "id": "inq_XYZ",
          "attributes": { "status": "completed" }
        }
      }
    }
  }
}
```

| Path | Meaning |
|------|---------|
| `data.id` | Event ID — use as the **idempotency key** |
| `data.attributes.name` | Event type, e.g. `inquiry.completed` |
| `data.attributes.created-at` | Timestamp for **ordering** events |
| `data.attributes.payload.data` | The affected object — same schema as the corresponding API response |
| `data.attributes.payload.included` | Related objects, when present |

Each webhook is pinned to a configurable **API version**, which fixes the schema
of `payload.data`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `inquiry.created` | A new inquiry is created | Track funnel start |
| `inquiry.started` | An end user begins an inquiry | Analytics |
| `inquiry.completed` | The user finishes all inquiry steps | Kick off review/provisioning |
| `inquiry.approved` | An inquiry is approved | Unlock the account/feature |
| `inquiry.declined` | An inquiry is declined | Block or downgrade the user |
| `inquiry.marked-for-review` | An inquiry needs manual review | Route to an agent |
| `inquiry.failed` | Too many failed attempts | Prompt retry / support |
| `inquiry.expired` | An inquiry expires unfinished | Re-invite the user |
| `verification.passed` | A verification passes | Record verification state |
| `verification.failed` | A verification fails | Ask for another document |
| `account.created` | An account is created | Sync to your user store |
| `account.archived` | An account is archived | Deactivate locally |
| `case.created` | A case is opened | Notify compliance |
| `case.resolved` | A case is resolved | Close internal ticket |
| `report/watchlist.ready` | A watchlist report finishes | Screen against sanctions lists |

**Report events use the slash form** `report/<type>.<action>` (e.g.
`report/adverse-media.matched`, `report/watchlist.ready`), unlike the dotted form
used elsewhere.

## Full Event Reference

For the complete, current list of event types, see the
[Persona Events documentation](https://docs.withpersona.com/events).
