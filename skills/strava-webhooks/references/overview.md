# Strava Webhooks Overview

## What Are Strava Webhooks?

Strava's **Webhook Events API** (push subscriptions) lets your application receive
a notification the moment an athlete's data changes — instead of polling the REST
API. When an athlete who has authorized your application creates, updates, or
deletes an activity, or deauthorizes your app, Strava sends an HTTP `POST` to the
callback URL you registered.

Two important characteristics shape every Strava integration:

1. **Payloads are thin.** An event tells you *what* changed (an `object_id` and
   `object_type`) but not the full object. Fetch the full activity or athlete
   from the [Strava REST API](https://developers.strava.com/docs/reference/)
   using the `object_id` and the athlete's access token.
2. **Events are not signed.** There is no per-event signature or HMAC. Trust is
   established once, during the [subscription validation handshake](verification.md),
   and reinforced by checking the `subscription_id` on incoming events.

## Common Event Types

Strava does not use a single event-name string. Each event is the combination of
an `object_type` and an `aspect_type`.

| `object_type` | `aspect_type` | Triggered When | Common Use Cases |
|---------------|---------------|----------------|------------------|
| `activity` | `create` | An athlete uploads or records a new activity | Import the activity, kick off analysis, post to a feed |
| `activity` | `update` | An activity's `title`, `type`, or `private` flag changes | Re-sync cached activity metadata |
| `activity` | `delete` | An activity is deleted | Remove the activity from your store |
| `athlete` | `update` | An athlete deauthorizes your application | Revoke tokens, delete stored data, stop syncing |

`object_type` is always `activity` or `athlete`. `aspect_type` is always
`create`, `update`, or `delete`. (Athlete events in practice arrive as
`athlete` + `update` for deauthorization.)

## The `updates` Field

- **Activity `update`:** keys may include `title`, `type`, and `private`
  (`"true"` when visibility is *Only You*, otherwise `"false"`). A single "save"
  by the athlete can result in multiple webhook events because some attributes are
  updated asynchronously.
- **Athlete deauthorization:** always contains `"authorized": "false"`.

## Event Payload Structure

```json
{
  "object_type": "activity",
  "object_id": 1360128428,
  "aspect_type": "create",
  "owner_id": 134815,
  "subscription_id": 120475,
  "event_time": 1516126040,
  "updates": {}
}
```

Field reference:

| Field | Description |
|-------|-------------|
| `object_type` | `activity` or `athlete` |
| `object_id` | For activities, the activity ID. For athlete events, the athlete ID |
| `aspect_type` | `create`, `update`, or `delete` |
| `owner_id` | The athlete's ID |
| `subscription_id` | The push subscription ID receiving this event |
| `event_time` | Unix timestamp of when the event occurred |
| `updates` | Hash of changed fields (see above); `{}` for create/delete |

## Delivery & Retries

- Your callback must return `200 OK` **within 2 seconds**.
- If a `200` is not returned, Strava retries — up to **3 total attempts**.
- Because a single change can emit multiple events and retries can duplicate
  them, process events **idempotently** (dedupe on `object_id` + `aspect_type` +
  `event_time`).

## Subscription Limits

Each API application may have **only one** push subscription. That single
subscription delivers events for **all** athletes who have authorized your
application.

## Full Event Reference

For the complete specification, see the
[Strava Webhook Events API documentation](https://developers.strava.com/docs/webhooks/).
