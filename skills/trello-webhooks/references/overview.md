# Trello Webhooks Overview

## What Are Trello Webhooks?

Trello webhooks notify your application when something changes on a model you are
watching — a **board**, **card**, **list**, or **member**. When an action occurs on
that model (or any of its children — e.g. a card on a watched board), Trello sends an
HTTP `POST` with a JSON payload to your registered `callbackURL`.

Unlike many providers, Trello webhooks are created **only via the REST API** (there is
no dashboard toggle), and each webhook watches exactly **one model** identified by
`idModel`. To watch a whole board, register a webhook on the board's ID.

## Event Payload Structure

Every delivery contains three top-level objects:

```json
{
  "action": {
    "id": "5abbe4b7ddc1b351ef961414",
    "idMemberCreator": "5abbe4b7ddc1b351ef961414",
    "type": "createCard",
    "date": "2026-07-22T10:00:00.000Z",
    "data": {
      "board": { "id": "...", "name": "My Board" },
      "list": { "id": "...", "name": "To Do" },
      "card": { "id": "...", "name": "New card", "idShort": 42 }
    },
    "memberCreator": { "id": "...", "username": "alice", "fullName": "Alice" }
  },
  "model": {
    "id": "5abbe4b7ddc1b351ef961414",
    "name": "My Board",
    "desc": "",
    "url": "https://trello.com/b/xxxxxxxx"
  },
  "webhook": {
    "id": "...",
    "description": "My webhook",
    "idModel": "5abbe4b7ddc1b351ef961414",
    "callbackURL": "https://example.com/webhooks/trello",
    "active": true,
    "consecutiveFailures": 0,
    "firstConsecutiveFailDate": null
  }
}
```

- **`action`** — what happened. `action.type` is the event name; `action.data`
  contains the affected board/list/card; `action.memberCreator` is who did it.
- **`model`** — the object being watched (the one whose `id` you passed as `idModel`).
- **`webhook`** — the webhook configuration, including failure tracking.

## Common Event Types

The event name lives at `action.type` in the payload — there is **no event header**.

| `action.type` | Triggered When | Common Use Cases |
|---------------|----------------|------------------|
| `createCard` | A card is created | Sync new work items, trigger automation |
| `updateCard` | A card is moved, renamed, given a due date, or archived | Track status changes, mirror to other tools |
| `deleteCard` | A card is deleted | Clean up linked records |
| `commentCard` | A comment is added | Notify stakeholders, log discussion |
| `addAttachmentToCard` | An attachment is added | Ingest files, scan links |
| `addMemberToCard` | A member is assigned to a card | Reassign, notify the assignee |
| `createList` | A list is created | Mirror board structure |
| `updateList` | A list is renamed, moved, or archived | Keep column mappings in sync |
| `addMemberToBoard` | A member joins the board | Provision access |
| `removeMemberFromBoard` | A member is removed | Deprovision access |
| `updateBoard` | The board is renamed or reconfigured | Update cached metadata |

> **Tip**: `updateCard` covers many distinct changes. Inspect `action.data.old` and
> `action.data.card` to see exactly what changed (e.g. `action.data.listAfter` /
> `action.data.listBefore` for a card moved between lists).

## Delivery, Retries, and Auto-Disable

- Trello retries a failed delivery **3 times** with backoff (**30s, 60s, 120s**).
- A single successful (`200`) response resets the failure counter.
- A webhook is **auto-disabled** after roughly **30 consecutive days** of failures
  (more than ~1000 consecutive failures).
- Respond `200` quickly and do heavy work asynchronously.

## Full Event Reference

For the complete list of action types, see
[Trello action types](https://developer.atlassian.com/cloud/trello/guides/rest-api/action-types/)
and the [Trello webhooks guide](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/).
