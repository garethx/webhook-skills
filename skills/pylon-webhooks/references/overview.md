# Pylon Webhooks Overview

## What Are Pylon Webhooks?

[Pylon](https://usepylon.com) is a B2B customer support platform (issues,
shared inboxes, accounts, and knowledge base). Webhooks let Pylon push events to
your application in real time so you can sync issues to your own systems, trigger
automations, notify teams, or update analytics — instead of polling the API.

You configure a **webhook destination** (a URL + a set of event types) in Pylon's
API settings. When a subscribed event fires, Pylon POSTs a JSON payload to your
URL, signed with HMAC-SHA256 so you can verify it came from Pylon.

## Common Event Types

> ⚠️ **These event names are illustrative, not a verified catalog.** Pylon's
> canonical event-type list lives behind an authenticated account at
> `https://app.getpylon.com/docs/api#event-types`. Only `issue.created` and
> `issue.updated` are known to exist as concepts, and the exact token format
> (`issue.created` vs `issue_created` vs a trigger-based name) is **not** publicly
> documented. **Always confirm the event types against the event list shown in
> your own Pylon destination configuration** before relying on them in code.

| Event (illustrative) | Triggered when | Common use cases |
|----------------------|----------------|------------------|
| `issue.created` | A new support issue/ticket is opened | Mirror tickets into your DB, alert on-call, create a linked task |
| `issue.updated` | An issue's status, assignee, or fields change | Keep an external mirror in sync, trigger SLA automations |
| `issue.closed` **(example shape only — not confirmed to exist)** | An issue is resolved/closed | Send CSAT surveys, update reporting, close linked tasks |

## Event Payload Structure

Pylon delivers a JSON body. The exact schema is versioned via the
`Pylon-Webhook-Version` header (e.g. `2021-07`) and is documented in Pylon's
authenticated API docs. In practice a payload carries an event-type discriminator
and the affected resource, for example:

```json
{
  "event_type": "issue.created",
  "data": {
    "id": "issue_01H...",
    "title": "Login is broken",
    "state": "new",
    "account_id": "acc_01H..."
  }
}
```

Because the discriminator field name is **not publicly confirmed**, the handlers
in this skill read `event_type` and fall back to `type`. Adapt these to whatever
your destination actually sends.

## Delivery, Retries, and Inactive Destinations

- Respond quickly — Pylon does not document a delivery timeout, so acknowledge as
  soon as the signature verifies and do heavy work asynchronously.
- Failed deliveries are retried with exponential backoff, up to **5 total
  attempts**, with the final attempt roughly **31 hours** after the event was
  created.
- If a destination has **no successful deliveries for 7 days**, Pylon flips it to
  the `inactive` state and stops sending — monitor delivery health.

Because retries can deliver the same event more than once, process events
**idempotently** (dedupe on a stable id from the payload).

## Full Event Reference

The complete, authoritative event list is in Pylon's API docs (requires a Pylon
account): `https://app.getpylon.com/docs/api#event-types`. See also the public
[webhooks guide](https://getpylon.com/developers/guides/using-webhooks/).
