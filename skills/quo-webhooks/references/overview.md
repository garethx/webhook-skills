# Quo Webhooks Overview

## What Are Quo Webhooks?

Quo (quo.com) is a business phone / VoIP platform. Webhooks are how it pushes
real-time notifications of calls, messages, contacts and tasks to your
application, instead of you polling the API.

Quo's support documentation describes the feature verbatim as: "Send real-time
notifications of Quo, formerly OpenPhone, events to your applications".

**Quo is the platform formerly known as OpenPhone.** That rebrand explains
several things you'll trip over:

- the legacy signature header is still literally called `openphone-signature`
- the public API JSON is still served from
  `openphone-public-api-prod.s3.us-west-2.amazonaws.com`
- almost all community material and blog posts predate the rename and say
  "OpenPhone webhooks"

**Quo is not [Quoter](https://help.quoter.com).** Quoter is an unrelated CPQ /
sales-quoting company whose webhooks use an MD5-based `hash` FORM FIELD (not a header). It
has its own skill in this repository. It is also not Quora, not the Quo
card/loyalty app, and not Twilio.

## Two Generations

Quo runs two webhook generations side by side. Which one an endpoint receives is
decided **when the subscription is created**, not by anything on your server.

| | Current | Legacy |
|---|---|---|
| Created with | `Quo-Api-Version: 2026-03-30` | unversioned `/v1/webhooks/messages`, `/v1/webhooks/calls`, `/v1/webhooks/call-summaries`, `/v1/webhooks/call-transcripts` |
| `apiVersion` in payload | `"2026-03-30"` | `"v2"`, or `"v3"` for AI events |
| Payload body | `data.resource` + `data.context` + `data.links` | `data.object` |
| Signature header | `webhook-id` / `webhook-timestamp` / `webhook-signature` | `openphone-signature` |

Signature details for both are in
[verification.md](verification.md). This page covers the payloads.

## Event Payload Structure

### Current envelope (`apiVersion: "2026-03-30"`)

```json
{
  "id": "EV123",
  "apiVersion": "2026-03-30",
  "createdAt": "2026-04-13T12:00:00.000Z",
  "type": "call.summary.completed",
  "data": {
    "resource": {},
    "context": { "orgId": "OR123" },
    "links": { "quo": "https://my.quo.com/..." }
  }
}
```

| Key | Meaning |
|---|---|
| `id` | The **event** id — see the deduplication warning below |
| `apiVersion` | The version the subscription was created against |
| `createdAt` | ISO-8601 timestamp of the event |
| `type` | The event type string, e.g. `message.received` |
| `data.resource` | The business object the event is about |
| `data.context` | Surrounding metadata; always includes `orgId` |
| `data.links.quo` | Deep link into the Quo app, or `null` |

### Legacy envelope (`apiVersion: "v2"` / `"v3"`)

```json
{
  "id": "EVc67ec998b35c41d388af50799aeeba3e",
  "object": "event",
  "apiVersion": "v2",
  "createdAt": "2022-01-23T16:55:52.557Z",
  "type": "message.received",
  "data": {
    "object": {
      "id": "AC24a8...",
      "object": "message",
      "from": "+14155550100",
      "to": "+13105550199",
      "direction": "incoming",
      "body": "Hello",
      "media": [],
      "status": "received",
      "createdAt": "2022-01-23T16:55:52.420Z",
      "userId": "USu5AsEHuQ",
      "phoneNumberId": "PNtoDbDhuz",
      "conversationId": "CN78ba0373683c48fd8fd96bc836c51f79"
    }
  }
}
```

Note the legacy shape also carries a top-level `object: "event"` key, which the
current shape does not.

### Field names differ between generations

| Concept | Legacy (`v2`/`v3`) | Current (`2026-03-30`) |
|---|---|---|
| Message text | `data.object.body` | `data.resource.text` |
| Sender | `data.object.from` | `data.context.senderIdentifier` |
| Recipients | `data.object.to` | `data.context.recipientIdentifiers` |

**If your endpoint may receive both, branch first.** Either on `apiVersion`, or
— more robustly — on whether `data.resource` or `data.object` is present:

```javascript
const payload = data.resource ?? data.object;   // works for both generations
const isLegacy = data.object !== undefined;
```

The examples in this skill do exactly that.

## Deduplicating: Use the Header, Not the Envelope

**`id` in the body identifies the EVENT, not the delivery.** Every endpoint
subscribed to a given event receives the *same* `id`. Two endpoints, one `id`.

Deduplicate on the **`webhook-id` header** instead. It is unique per delivery
and stable across retries — which is exactly what an idempotency key needs to
be. Store processed ids for **at least 28 hours** to cover the full retry
window (see below).

Legacy deliveries carry no `webhook-id` header. For those, key on the envelope
`id` plus the destination, or on a hash of the raw body.

## `unavailable` Means Unknown, Not Empty

Two `context` fields in the current envelope use a status enum, and both have a
value that handlers routinely misread:

**`context.contacts.lookupStatus`**

| Value | Meaning |
|---|---|
| `matched` | Contacts were found; the ids are populated |
| `none` | No matching contacts exist; the id array is genuinely empty |
| `unavailable` | Quo could not perform the lookup; treat the ids as **unknown** |

**`context.participants.resolution`**

| Value | Meaning |
|---|---|
| `available` | Workspace and external participant data resolved |
| `unavailable` | Context unresolved; treat empty arrays as **unknown** |

Reading `unavailable` as "no contacts" produces the classic bug: an existing
customer gets treated as an unknown caller and routed to the wrong queue. Only
`none` means "we looked and there's nothing".

## Event Types

Every event below has its own documented schema and example in the 2026-03-30
payload reference.

### Message events

| Event | Triggered When | Common Use Cases |
|---|---|---|
| `message.received` | An inbound SMS/MMS arrives | Auto-reply, CRM logging, keyword routing |
| `message.delivered` | An outbound message is confirmed delivered | Delivery receipts, campaign reporting |
| `message.failed` | An outbound message failed to send | Alerting, retry with another number |
| `message.undelivered` | Carrier reported non-delivery | Bad-number cleanup, suppression lists |

### Call events

| Event | Triggered When | Common Use Cases |
|---|---|---|
| `call.ringing` | An inbound call starts ringing | Screen pop, presence updates |
| `call.menu.selected` | A caller chose an IVR menu option | Routing analytics, menu tuning |
| `call.answered` | A call was answered | Response-time metrics |
| `call.completed` | A call ended | CRM activity logging, billing |
| `call.forwarded` | A call was forwarded | Overflow and escalation tracking |
| `call.missed` | A call was not answered | Callback queues, SLA alerts |

### Call AI and media events

| Event | Triggered When | Common Use Cases |
|---|---|---|
| `call.recording.completed` | A recording finished processing | Archival, QA review |
| `call.summary.completed` | An AI summary is ready | CRM notes, handoff context |
| `call.transcript.completed` | An AI transcript is ready | Search, compliance, coaching |
| `call.voicemail.completed` | A voicemail finished processing | Voicemail-to-ticket, transcription |

### Contact events

| Event | Triggered When | Common Use Cases |
|---|---|---|
| `contact.updated` | A contact was created or changed | Two-way CRM sync |
| `contact.deleted` | A contact was removed | Downstream cleanup, GDPR |

Contact events are always **workspace-wide** — they ignore `resourceIds`.

### Task events

| Event | Triggered When |
|---|---|
| `task.created` | A task was created |
| `task.updated` | A task's fields changed |
| `task.deleted` | A task was deleted |
| `task.completed` | A task was marked complete |
| `task.reopened` | A completed task was reopened |
| `task.assigned` | A task was assigned to a user |
| `task.unassigned` | A task's assignee was removed |
| `task.overdue` | A task passed its due date |
| `task.linked` | A task was linked to another resource |
| `task.unlinked` | A task link was removed |
| `task.duedate.updated` | A task's due date changed |
| `task.duedate.removed` | A task's due date was cleared |

### Legacy event-name differences

The support-docs (legacy) list is a **subset** of the above, **plus two
differently-named task events**:

| Legacy name | Current name |
|---|---|
| `task.due_date_changed` | `task.duedate.updated` |
| `task.due_date_removed` | `task.duedate.removed` |

Note the underscores and the different word split. The legacy list also **lacks**
`message.failed`, `message.undelivered`, `call.menu.selected`, `call.answered`,
`call.forwarded`, `call.missed`, `call.voicemail.completed` and `task.assigned`.

Treat the versioned reference as authoritative for new integrations, but keep
the underscored aliases in your dispatch table if you still have legacy
webhooks — dropping them silently loses due-date changes.

### Undocumented payloads: `integration.*`

The create-webhook endpoint's `events` enum additionally accepts
`integration.created`, `integration.updated` and `integration.deleted`. These
have **no documented payload** in the event payload reference, so this skill
makes no claims about their shape. Log and ignore them unless you have observed
a real delivery.

## There Is No Handshake and No Test Event Type

Quo sends **no challenge, echo, or validation request** when you register an
endpoint. It just starts delivering.

The **"Send Test Request"** button in the app (and `POST /webhooks/:id/events/test`
on the API) sends a normal, **fully-signed** sample payload of a chosen event
type. It is an ordinary delivery that happens to contain sample data — not a
special envelope, not an unsigned ping, and **not** a `webhook.test` event type.
That type does not exist. Do not write a branch for it.

## Subscription Rules

- `message.*` and `call.*` accept a `resourceIds` filter: an array of phone
  number ids matching `^PN.*$`, or `["*"]` for all activity. Omitted, it
  defaults to `["*"]`.
- `contact.*` is always org-wide regardless of `resourceIds`.
- Activity and org-wide events can be mixed on one webhook; `resourceIds` then
  applies only to the activity events.
- At least one event is required per webhook.
- **A workspace can have at most 50 webhooks.**

## Delivery, Retries, and Ordering

**Respond 2xx within 10 seconds.** Any non-2xx response, or a timeout, triggers
retries.

**Retry schedule — 8 attempts:**

| Attempt | Delay after previous |
|---|---|
| 1 | immediate |
| 2 | +5 seconds |
| 3 | +5 minutes |
| 4 | +30 minutes |
| 5 | +2 hours |
| 6 | +5 hours |
| 7 | +10 hours |
| 8 | +10 hours |

Total window: roughly **27 hours 35 minutes** from the first attempt. That is
why processed ids need a 28-hour-plus retention.

**Ordering is not guaranteed** — not across event families, and, per Quo's own
warning, occasionally **not even within a single resource**. A
`call.transcript.completed` can arrive before the matching
`call.summary.completed` for the same call.

Do not drive a state machine off arrival order. Compare
`data.resource.updatedAt` against your stored state and **ignore stale events**:

```javascript
if (stored && new Date(resource.updatedAt) <= new Date(stored.updatedAt)) {
  return;  // stale — a newer version of this resource is already persisted
}
```

## Full Event Reference

- [Webhooks overview (2026-03-30)](https://www.quo.com/docs/2026-03-30/webhooks-overview)
- [Event payloads (2026-03-30)](https://www.quo.com/docs/2026-03-30/webhooks-event-payloads)
- [Support docs — Webhooks (legacy)](https://support.quo.com/core-concepts/integrations/webhooks)
