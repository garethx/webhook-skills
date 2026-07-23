# Twitter / X Webhooks Overview

## What Are Twitter/X Webhooks?

Twitter/X delivers real-time account activity through the **Account Activity
API (AAA)**. Instead of polling, you register a single public HTTPS endpoint per
app environment and X pushes JSON events to it whenever a subscribed user's
account has activity — new Posts, likes, follows, blocks, mutes, and direct
messages.

Webhooks are configured with the **V2 Webhooks API**:

- `POST /2/webhooks` — register a webhook URL (OAuth2 App-Only bearer auth)
- `GET /2/webhooks` — list registered webhooks
- `DELETE /2/webhooks/:webhook_id` — remove a webhook
- `PUT /2/webhooks/:webhook_id` — trigger an on-demand CRC re-validation

Per-user delivery requires a **subscription**:

- `POST /2/account_activity/webhooks/:webhook_id/subscriptions/all` — subscribe
  the authenticating user (OAuth 1.0a user context)

## Requirements

- An **approved developer account** with Account Activity API access.
- Access tiers: **Pay-Per-Use** (1 webhook, 3 subscriptions) or **Enterprise**
  (5+ webhooks, 5000+ subscriptions).
- Endpoint must be **public HTTPS with no port in the URL** and respond within
  **10 seconds**.

## Common Event Types

Payloads are JSON objects keyed by the event type. A single POST may contain one
event array. The top-level `for_user_id` names the subscribed user the activity
is delivered for.

| Event key | Triggered when | Notes |
|-----------|----------------|-------|
| `tweet_create_events` | A Post/Tweet, Retweet, reply, @mention, or quote is created | Array of Tweet objects |
| `tweet_delete_events` | A Post is deleted | Compliance notice with status id + timestamp |
| `favorite_events` | A user likes a Post | Includes the liked Tweet and the user |
| `follow_events` | A follow or unfollow occurs | `event.type` is `follow` or `unfollow`, with `source` + `target` |
| `block_events` | A block or unblock occurs | `event.type` is `block` or `unblock` |
| `mute_events` | A mute or unmute occurs | `event.type` is `mute` or `unmute` |
| `direct_message_events` | A DM is sent or received | Message create with sender, recipient, text |
| `direct_message_indicate_typing_events` | A user starts typing in a DM | Typing indicator |
| `direct_message_mark_read_events` | A DM is marked read | Read receipt with last read event id |
| `user_event` | App authorization is revoked | Subscription is auto-deleted |

## Event Payload Structure

Every delivery includes:

- `for_user_id` — the subscribed user id this activity belongs to.
- One event array/object keyed by the type above (e.g. `tweet_create_events`).

Example (`follow_events`):

```json
{
  "for_user_id": "3198576760",
  "follow_events": [
    {
      "type": "follow",
      "created_timestamp": "1552253396437",
      "target": { "id": "3198576760", "screen_name": "someuser" },
      "source": { "id": "44196397", "screen_name": "anotheruser" }
    }
  ]
}
```

Because the same endpoint receives every event type, dispatch on the **presence
of a known event key** in the payload rather than a single `type` field.

## Delivery Semantics

- **No timestamp** is part of the signature scheme, so there is **no replay
  protection** built in.
- **Retry-on-failure is not documented for v2** — treat delivery as
  **at-most-once**. Make handlers idempotent and add your own reliability layer
  (queue, gateway) if you cannot afford to miss events.

## Full Event Reference

For the complete list of events and payload fields, see the
[Account Activity API documentation](https://docs.x.com/x-api/account-activity/introduction).
