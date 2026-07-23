# monday.com Webhooks Overview

## What Are monday.com Webhooks?

monday.com webhooks push board activity — items created, column values changed,
updates posted, subitems added — to an HTTPS endpoint you control. Each webhook is
attached to a single board and subscribes to a **single event type**. To receive
multiple event types, create multiple webhooks for the same board.

Webhooks are created either through the board's **Integrations center** (the no-code
"Webhooks" integration) or programmatically with the `create_webhook` GraphQL
mutation. See [setup.md](setup.md).

## The Challenge Handshake

When a webhook is registered, monday.com immediately POSTs a JSON body containing a
`challenge` token:

```json
{ "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" }
```

Your endpoint **must** respond with HTTP 200 and echo the same value back:

```json
{ "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" }
```

If the echo is missing or wrong, registration fails. This handshake is the only
authentication check guaranteed for **every** webhook, including no-code and
personal-token webhooks.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `create_item` | A new item (pulse) is created | Sync new records, trigger onboarding |
| `change_column_value` | Any column value changes | Mirror data to external systems |
| `change_status_column_value` | A status column changes | Kick off workflows when status hits "Done" |
| `change_specific_column_value` | A configured column changes | Fine-grained column watching (needs `config`) |
| `change_name` | An item's name changes | Keep external titles in sync |
| `create_update` | An update (comment) is posted | Notify Slack, log activity |
| `edit_update` | An update is edited | Audit trail |
| `create_subitem` | A subitem is created | Track sub-task creation |
| `change_subitem_column_value` | A subitem column changes | Sub-task data sync |
| `item_archived` | An item is archived | Soft-delete downstream |
| `item_deleted` | An item is deleted | Clean up external records |
| `item_moved_to_any_group` | An item moves between groups | Stage/pipeline tracking |

## Event Payload Structure

Real events (everything except the challenge) wrap their data in an `event` object:

| Field | Type | Description |
|-------|------|-------------|
| `type` | String | The event type (e.g. `change_column_value`) |
| `userId` | Number | User who triggered the event |
| `boardId` | Number | Board identifier |
| `pulseId` | Number | Item (pulse) identifier |
| `pulseName` | String | Item name |
| `groupId` / `groupName` | String | Group the item belongs to |
| `columnId` / `columnType` / `columnTitle` | String | Affected column (change events) |
| `value` / `previousValue` | Object | New and prior column values |
| `columnValues` | Object | Snapshot of all column data (create events) |
| `triggerTime` | ISO String | UTC timestamp of the trigger |
| `subscriptionId` | Number | ID of the webhook subscription |
| `triggerUuid` | String | Unique ID for this trigger — use for idempotency |
| `parentItemId` / `parentItemBoardId` | Number | Present on **subitem** events only |

Example:

```json
{
  "event": {
    "type": "create_item",
    "userId": 9603417,
    "boardId": 1771812698,
    "pulseId": 1772099344,
    "pulseName": "New task",
    "groupId": "topics",
    "columnValues": {},
    "triggerTime": "2021-10-11T09:24:03.960Z",
    "subscriptionId": 73759690,
    "triggerUuid": "b12b4f2b58e83e2b4b6e2f7e6f4b1a2c"
  }
}
```

## Retries

Requests sent through monday.com's webhook integration **retry once a minute for 30
minutes** if your endpoint does not respond with a 2xx status. Return `200` quickly
and process heavy work asynchronously. Deduplicate using `triggerUuid` because
retries repeat the same event.

## Full Event Reference

For the complete, current list of events and their payloads, see
[monday.com's Webhooks documentation](https://developer.monday.com/api-reference/reference/webhooks).
