# Twitch Webhooks Overview

## What Are Twitch Webhooks?

Twitch delivers real-time events through **EventSub**, its unified eventing
system. EventSub supports three transports — WebSocket, conduits, and
**webhooks**. This skill covers the **webhook transport**: Twitch sends an HTTP
POST to your HTTPS callback whenever an event you subscribed to occurs (a stream
goes live, a viewer follows, a subscription is gifted, and so on).

Unlike many providers, you do **not** register a webhook endpoint in a
dashboard. Instead you **create a subscription** by calling
`POST /helix/eventsub/subscriptions` with an **app access token**, specifying:

- The event `type` and `version` (e.g. `stream.online` v1, `channel.follow` v2)
- A `condition` (e.g. `{ "broadcaster_user_id": "1234" }`)
- A `transport` of `{ "method": "webhook", "callback": "https://...", "secret": "..." }`

The `secret` (10–100 ASCII characters) you provide at creation time is what
Twitch uses to sign every message for that subscription. Store it — it is never
shown again.

> Twitch EventSub does **not** follow the Standard Webhooks specification. It has
> its own headers, its own signed-message format, and a three-way message-type
> handshake.

## Message Types

Every request carries a `Twitch-Eventsub-Message-Type` header:

| Type | Meaning | Your response |
|------|---------|---------------|
| `webhook_callback_verification` | Sent once when the subscription is created to prove you own the callback | HTTP 200 with the raw `challenge` string as the body (`text/plain`) |
| `notification` | An event occurred | HTTP 2XX after handling `payload.event` |
| `revocation` | Twitch stopped the subscription | HTTP 2XX; log `payload.subscription.status` |

Revocation reasons: `user_removed`, `authorization_revoked`,
`notification_failures_exceeded`, `version_removed`.

## Common Event Types

| Subscription type | Version | Triggered When | Common Use Cases |
|-------------------|---------|----------------|------------------|
| `stream.online` | 1 | Broadcaster starts streaming | Live alerts, "now live" posts, start recording |
| `stream.offline` | 1 | Broadcaster stops streaming | End-of-stream summaries, stop recording |
| `channel.follow` | 2 | A channel receives a follow | Follower alerts, welcome messages |
| `channel.update` | 2 | Title/category/labels change | Update embeds, log category changes |
| `channel.subscribe` | 1 | A user subscribes | Sub alerts, loyalty rewards |
| `channel.subscription.gift` | 1 | A user gifts subscriptions | Gift-sub alerts, leaderboard |
| `channel.cheer` | 1 | A user cheers with Bits | Bits alerts, goal tracking |
| `channel.raid` | 1 | A broadcaster raids another channel | Raid alerts, shoutouts |
| `channel.ban` | 1 | A viewer is banned | Moderation logs |
| `channel.channel_points_custom_reward_redemption.add` | 1 | A custom reward is redeemed | Fulfill reward, queue actions |

## Event Payload Structure

A `notification` body has two top-level objects:

```json
{
  "subscription": {
    "id": "f1c2a387-...",
    "type": "stream.online",
    "version": "1",
    "status": "enabled",
    "cost": 0,
    "condition": { "broadcaster_user_id": "1337" },
    "transport": { "method": "webhook", "callback": "https://..." },
    "created_at": "2026-07-22T00:00:00.000Z"
  },
  "event": {
    "id": "9001",
    "broadcaster_user_id": "1337",
    "broadcaster_user_login": "cool_user",
    "broadcaster_user_name": "Cool_User",
    "type": "live",
    "started_at": "2026-07-22T00:00:00Z"
  }
}
```

- `subscription.type` and `subscription.version` identify the event. They also
  appear in the `Twitch-Eventsub-Subscription-Type` /
  `Twitch-Eventsub-Subscription-Version` headers.
- `event` holds the event-specific fields. Its shape varies per type.
- For `webhook_callback_verification`, the body has a `challenge` field instead
  of `event`.

## Subscription Cost

Subscriptions have a cost model. Each application has a `max_total_cost`
(commonly 10000). Subscriptions authorized by the user (where the user granted
your app a scope) cost **0**; others cost 1 toward the limit. Check the `cost`
and `total_cost` returned when creating subscriptions.

## Full Event Reference

For the complete list of events, conditions, and payloads, see
[Twitch EventSub Subscription Types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).
