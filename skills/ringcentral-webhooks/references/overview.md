# RingCentral Webhooks Overview

## What Are RingCentral Webhooks?

RingCentral notifies your application about account activity — new messages,
calls, presence changes — by delivering webhook notifications to an HTTPS
endpoint you register. Instead of polling the RingCentral REST API, you create a
**subscription** describing which events you want and where to send them.
RingCentral then POSTs a JSON notification to your `address` whenever a matching
event occurs.

Unlike most providers, RingCentral webhooks are **not HMAC-signed** and do **not**
follow the [Standard Webhooks](https://www.standardwebhooks.com/) spec.
Authenticity is established by a mandatory **Validation-Token handshake** at
subscription time and an optional **Verification-Token** header on every
notification.

## Common Event Types

RingCentral events are identified by an **event filter** — an API resource path —
carried in the notification's `event` field. There are no short event names.

| Event filter | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `/restapi/v1.0/account/~/extension/~/message-store` | New message stored (SMS, voicemail, fax) | Message logging, auto-reply |
| `/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS` | Inbound SMS delivered | SMS bots, notifications |
| `/restapi/v1.0/account/~/extension/~/presence` | Extension presence/telephony state changes | Agent availability, dashboards |
| `/restapi/v1.0/account/~/telephony/sessions` | Call lifecycle across the account | Call tracking, CTI screen-pops |
| `/restapi/v1.0/account/~/extension/~/telephony/sessions` | Per-extension call events | Per-agent call analytics |
| `/restapi/v1.0/account/~/extension` | Extension created, updated, or deleted | Provisioning automation |

The `~` in a filter means "current authenticated account/extension" and is
substituted with concrete IDs by RingCentral.

## Event Payload Structure

A notification body looks like:

```json
{
  "uuid": "a7c1f0e2-...",
  "event": "/restapi/v1.0/account/111/extension/222/message-store",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "subscriptionId": "b8d2...",
  "ownerId": "222",
  "body": {
    "changes": [ { "type": "SMS", "newCount": 1, "updatedCount": 0 } ],
    "lastUpdated": "2024-01-15T10:00:00.000Z"
  }
}
```

| Field | Description |
|-------|-------------|
| `uuid` | Unique notification ID (use for idempotency) |
| `event` | The event filter that triggered this notification |
| `timestamp` | When the event occurred (ISO 8601) |
| `subscriptionId` | The subscription that produced the notification |
| `ownerId` | Extension/account that owns the resource |
| `body` | Event-specific payload |

Dispatch your handler by matching substrings of the `event` filter (e.g.
`event.includes('/message-store')`), since the filter contains concrete IDs.

## Important Headers

| Header | Direction | Description |
|--------|-----------|-------------|
| `Validation-Token` | request → echoed in response | Sent on subscribe/renew; echo it back to complete the handshake |
| `Verification-Token` | request | Your configured token, present on every notification |

## Full Event Reference

For the complete list of event filters and payloads, see:
- [RingCentral Notifications Guide](https://developers.ringcentral.com/guide/notifications/webhooks/creating-webhooks)
- [Event Filters Reference](https://developers.ringcentral.com/guide/notifications/manual/event-filters)
