# Airtable Webhooks Overview

## What Are Airtable Webhooks?

Airtable webhooks let your application react to changes in a base — new records,
edited cells, added/removed fields, and table structure changes. Unlike most webhook
providers, Airtable uses a **thin-ping** model: the notification itself contains **no
change data**, only a pointer to which base/webhook changed. You then pull the actual
changes from the payloads API using a cursor.

This design keeps notifications small and lets you catch up on missed changes by
replaying from a persisted cursor — the webhook is essentially a "there is new data"
signal over a durable change log.

## The Two-Step Flow

1. **Notification** — Airtable POSTs a small JSON body to your `notificationUrl`:
   ```json
   {
     "base": { "id": "appABCDEF123456" },
     "webhook": { "id": "achXYZ7890" },
     "timestamp": "2022-02-01T21:25:05.663Z"
   }
   ```
   Respond **200 or 204 with an empty body within 25 seconds**. Do the heavy lifting
   (step 2) asynchronously.

2. **Fetch payloads** — Call
   `GET https://api.airtable.com/v0/bases/{baseId}/webhooks/{webhookId}/payloads?cursor={cursor}`
   with a Personal Access Token. Persist the returned `cursor` and keep fetching while
   `mightHaveMore` is `true`.

## Change Types (What You Subscribe To)

Airtable has no fixed list of event names. Instead you declare a **specification** when
you create the webhook. Notifications fire when a matching change occurs.

| Field | Values | Meaning |
|-------|--------|---------|
| `dataTypes` | `tableData`, `tableFields`, `tableMetadata` | Which kind of change to watch |
| `changeTypes` | `add`, `remove`, `update` | Restrict to additions, removals, or edits |
| `fromSources` | `client`, `publicApi`, `formSubmission`, `automation`, `system`, `sync`, `anonymousUser`, `unknown` | Restrict to changes from certain origins |
| `recordChangeScope` | a `tableId` | Scope record-level changes to a single table |

- **`tableData`** — record cell values created, changed, or destroyed.
- **`tableFields`** — fields (columns) added, updated, or removed.
- **`tableMetadata`** — base/table schema changes (e.g. table name).

## Payload Structure

Each item in the `payloads` array describes one base transaction:

```json
{
  "timestamp": "2022-02-01T21:25:05.663Z",
  "baseTransactionNumber": 4,
  "payloadFormat": "v0",
  "actionMetadata": {
    "source": "client",
    "sourceMetadata": { "user": { "id": "usr...", "email": "..." } }
  },
  "changedTablesById": {
    "tblABC123": {
      "createdRecordsById": { "rec...": { "cellValuesByFieldId": { } } },
      "changedRecordsById": { "rec...": { "current": { }, "previous": { } } },
      "destroyedRecordIds": ["rec..."]
    }
  }
}
```

The top-level response wraps these:

```json
{ "payloads": [ ... ], "cursor": 5, "mightHaveMore": false }
```

Use `baseTransactionNumber` as an idempotency key — it is monotonic per base.

## Full Event Reference

- [Webhooks overview](https://airtable.com/developers/web/api/webhooks-overview)
- [Create a webhook](https://airtable.com/developers/web/api/create-a-webhook)
- [List webhook payloads](https://airtable.com/developers/web/api/list-webhook-payloads)
