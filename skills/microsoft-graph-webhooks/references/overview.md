# Microsoft Graph Webhooks Overview

## What Are Microsoft Graph Change Notifications?

Microsoft Graph lets your app **subscribe** to changes on a resource and receive
**change notifications** (webhooks) when that resource is created, updated, or
deleted. Instead of polling, you register a subscription with a `notificationUrl`
and Graph POSTs a small JSON payload to it whenever a matching change occurs.

Subscriptions are created via the Graph API (`POST /subscriptions`) using an
OAuth 2.0 access token — there is no dashboard step to add a webhook endpoint.
The URL, resource, change types, and expiry are all set on the subscription.

Unlike most providers, Microsoft Graph does **not** sign notifications with an
HMAC and does **not** follow the Standard Webhooks spec. Authenticity is
established by:

1. The **endpoint validation handshake** (proves you own the URL).
2. The **`clientState`** shared secret echoed in every notification.
3. For rich notifications, **`validationTokens`** (JWTs) plus AES-encrypted data.

## Common Resources You Can Subscribe To

| Resource (example) | What it tracks |
|--------------------|----------------|
| `me/messages`, `users/{id}/messages` | Outlook mail |
| `me/events`, `users/{id}/events` | Outlook calendar events |
| `me/contacts` | Outlook contacts |
| `/teams/{id}/channels/{id}/messages` | Teams channel messages |
| `/chats/{id}/messages` | Teams chat messages |
| `/communications/presences/{id}` | Presence (online status) |
| `/drives/{id}/root`, `/sites/{id}/drive/root` | OneDrive / SharePoint driveItems |
| `/users`, `/groups` | Directory objects |
| `/security/alerts_v2` | Security alerts |

## Change Types (Events)

Microsoft Graph's "events" are the three change types you subscribe to. Combine
them with a comma (e.g. `"created,updated"`):

| `changeType` | Triggered when | Notes |
|--------------|----------------|-------|
| `created` | A matching resource is created | Not supported for `user`/`group` |
| `updated` | A matching resource is updated | Only value supported by driveItem root and SharePoint list |
| `deleted` | A matching resource is deleted / soft-deleted | |

## Lifecycle Events

In addition to change notifications, Graph sends **lifecycle notifications** to a
separate `lifecycleNotificationUrl`. These keep long-lived subscriptions healthy:

| `lifecycleEvent` | Meaning | What to do |
|------------------|---------|-----------|
| `reauthorizationRequired` | The subscription/token is about to expire or permissions changed | Reauthorize (`POST /subscriptions/{id}/reauthorize`) and/or renew (`PATCH`) |
| `subscriptionRemoved` | Graph removed the subscription | Recreate it, then resync via delta query |
| `missed` | Notifications could not be delivered | Resync missed data via delta query |

## Notification Payload Structure

A basic notification is a batch of items under `value`:

```json
{
  "value": [
    {
      "subscriptionId": "b3a...guid",
      "subscriptionExpirationDateTime": "2026-07-22T22:11:09.952Z",
      "changeType": "updated",
      "resource": "Users/{user-id}/messages/{message-id}",
      "clientState": "your-opaque-secret",
      "tenantId": "84bd8158-6d4d-4958-8b9f-9d6445542f95",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Message",
        "@odata.id": "Users/{user-id}/Messages/{message-id}",
        "@odata.etag": "W/\"CQAAABYAAA...\"",
        "id": "{message-id}"
      }
    }
  ]
}
```

Key fields:

- `value` — array; a single POST can batch multiple notifications.
- `subscriptionId` — the subscription that produced the notification.
- `changeType` — `created`, `updated`, or `deleted`.
- `resource` / `resourceData` — what changed. Basic notifications include only an
  ID and type; fetch the full resource from Graph, or use rich notifications.
- `clientState` — your shared secret; validate it on every notification.
- `tenantId` — the tenant where the change happened.

## Response Requirements

- Return a **2xx (recommended `202 Accepted`) within 3 seconds**. Do heavy work
  asynchronously.
- Graph retries undelivered notifications with exponential backoff for up to
  **4 hours** (the timeout is extended to 10 seconds for retried notifications).
- Consistently slow or failing endpoints can be throttled or have notifications
  dropped, so always acknowledge fast and process off the request path.

## Subscription Lifetimes

Subscriptions expire and must be renewed via `PATCH /subscriptions/{id}` before
`expirationDateTime`. Maximum lifetimes vary by resource — from ~1 hour
(presence) to ~30 days (driveItem, SharePoint list). See
[setup.md](setup.md) for the full table and renewal guidance.

## Full Event Reference

- [Set up notifications for changes in resource data](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)
- [subscription resource type](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0)
- [Lifecycle notifications](https://learn.microsoft.com/en-us/graph/change-notifications-lifecycle-events)
