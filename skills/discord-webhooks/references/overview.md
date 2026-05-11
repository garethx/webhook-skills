# Discord Webhooks Overview

## What Are Discord Webhook Events?

Discord apps can receive **outgoing webhook events** — server-to-server HTTP POST requests Discord sends to your endpoint when something happens in your app's domain (a user authorizes the app, an entitlement is created, a lobby message is sent, etc.). The same Ed25519 signing scheme is also used by Discord's Interactions endpoints.

> ⚠️ This skill covers **outgoing webhooks** (Discord → your server). Discord's "Incoming Webhook URLs" (your server → a Discord channel) are a separate feature — those receive payloads from you and are not signed.

## Top-Level Payload Structure

Every request from Discord shares the same outer envelope:

```json
{
  "version": 1,
  "application_id": "123456789012345678",
  "type": 1,
  "event": {
    "type": "APPLICATION_AUTHORIZED",
    "timestamp": "2024-10-18T14:42:32.000Z",
    "data": { /* event-specific fields */ }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | integer | Always `1` for the current webhook event schema |
| `application_id` | snowflake | Your Discord app's ID |
| `type` | integer | `0` = PING (endpoint validation), `1` = webhook event |
| `event` | object | Present only when `type` is `1` |

### Inner `event` Object

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event name (uppercase, see table below) |
| `timestamp` | string | ISO 8601 time the event occurred |
| `data` | object | Event-specific payload (shape varies) |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `APPLICATION_AUTHORIZED` | A user (or guild) authorizes your application | Provision account, send welcome message |
| `APPLICATION_DEAUTHORIZED` | A user removes your application | Clean up user data, cancel subscriptions |
| `ENTITLEMENT_CREATE` | A user purchases or is granted an entitlement (premium subscription, one-time SKU) | Unlock premium features, grant access |
| `ENTITLEMENT_UPDATE` | An entitlement is renewed or modified | Update subscription state |
| `ENTITLEMENT_DELETE` | An entitlement is removed (refund, cancellation) | Revoke premium access |
| `QUEST_USER_ENROLLMENT` | A user enrolls in a Quest your app integrates with | Track Quest participation |
| `LOBBY_MESSAGE_CREATE` | A message is sent in a Discord Social SDK lobby | Mirror to game UI, moderation |
| `LOBBY_MESSAGE_UPDATE` | A lobby message is edited | Sync edits |
| `LOBBY_MESSAGE_DELETE` | A lobby message is deleted | Remove from caches |
| `GAME_DIRECT_MESSAGE_CREATE` | A direct message is sent via the game SDK | Show in-game chat |
| `GAME_DIRECT_MESSAGE_UPDATE` | A game DM is edited | Sync edits |
| `GAME_DIRECT_MESSAGE_DELETE` | A game DM is deleted | Remove from caches |

> Event names are **uppercase with underscores** (e.g. `APPLICATION_AUTHORIZED`, not `application.authorized`). Match the casing exactly when routing.

## The PING Validation Flow

When you save a webhook endpoint URL in the Discord Developer Portal, Discord immediately sends a **PING** request with `type: 0` to verify the endpoint:

1. Discord POSTs `{"version": 1, "application_id": "…", "type": 0}` to your endpoint, signed with Ed25519.
2. Your endpoint must verify the signature and respond with a 2XX status (the docs recommend `204` with an empty body) within 3 seconds.
3. If the response is not 2XX (or the signature check is skipped), Discord rejects the endpoint and registration fails.

Your handler must therefore support both `type: 0` (PING) and `type: 1` (events).

## Response Requirements

- Acknowledge within **3 seconds**. Slow responses cause Discord to retry and may eventually disable the endpoint.
- For PINGs, return `204` with an empty body.
- For events, any 2XX response is accepted. Returning `204` is also fine.
- Do heavy work asynchronously (queue/worker) — keep the handler itself fast.

## Full Event Reference

For the complete and authoritative list of events and payload schemas, see the official [Discord Webhook Events documentation](https://docs.discord.com/developers/events/webhook-events).
