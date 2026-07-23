# LinkedIn Webhooks Overview

## What Are LinkedIn Webhooks?

LinkedIn webhooks deliver real-time HTTP notifications for events on the LinkedIn platform. Webhooks are only available to applications with an **approved use case** — the "Webhooks" tab in the [Developer Portal](https://www.linkedin.com/developers/apps) is enabled per product, and each product is gated behind a partner program.

Every LinkedIn webhook URL serves two request types:

1. **`GET` endpoint validation** — LinkedIn proves it owns the challenge before (and repeatedly after) registration. See [verification.md](verification.md).
2. **`POST` event delivery** — the actual notifications, each signed with an `X-LI-Signature` header.

## Webhook Products and Event Types

LinkedIn does **not** send an event-type header. You identify the notification from the payload body. Each product below requires its own OAuth scope and partner-program access.

| Notification type | Product | Subscription API | Required scope |
|-------------------|---------|------------------|----------------|
| `LEAD_ACTION` | Lead Sync | `POST /rest/leadNotifications` | `r_marketing_leadgen_automation` + Lead Sync program |
| `ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS` | Community Management | `PUT /rest/eventSubscriptions` | `rw_organization_admin` |
| Apply Connect job status + resync | Talent | Parent/child app provisioning | Talent partner program |

### `LEAD_ACTION` (Lead Sync)

Fires when a member submits a LinkedIn Lead Gen Form. The webhook notification is a lightweight pointer; fetch the full lead data via the Lead Sync pull API. Missed notifications are retrievable via the pull API for **60 days**.

### `ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS` (Community Management)

Fires when a member comments on or reacts to content owned by an organization your app administers. Redelivery is documented for these: every **5 minutes for up to 8 hours** on failure.

### Talent / Apply Connect

Parent/child provisioned applications receive job status updates and resync requests. The GET validation may include an `applicationId` query parameter indicating which child app's `clientSecret` to sign with.

## Event Payload Structure

Payloads vary by product, but every notification includes a **Notification ID** used for deduplication. LinkedIn may deliver the same notification more than once — always dedupe on `notificationId`.

```json
{
  "notificationId": "urn:li:notification:...",
  "eventType": "LEAD_ACTION",
  ...
}
```

Because the discriminator field name differs by product, the example handlers classify the notification defensively (checking product-specific fields, then falling back to an explicit `eventType`). See the [examples](../examples/).

## Delivery Guarantees and Limits

- **HTTPS only** — non-HTTPS URLs are rejected. **ngrok URIs are not supported.**
- **Duplicates are expected** — dedupe on `notificationId`.
- **Redelivery** — every 5 minutes for up to 8 hours (documented for org social actions).
- **Missed notifications** — retrievable via the pull API for 60 days.
- **Endpoint blocking** — re-validated every 2 hours; blocked after 3 consecutive validation failures.
- From **2026-03-16**, unvalidated Lead Sync webhooks stop receiving notifications.

## Full Event Reference

- [Developer Webhooks Overview](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/developer-webhooks)
- [Webhook Validation](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/webhook-validation)
