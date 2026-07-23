# Setting Up LinkedIn Webhooks

## Prerequisites

- A LinkedIn app in the [Developer Portal](https://www.linkedin.com/developers/apps) with an **approved webhook use case**. The "Webhooks" tab is only enabled for apps with an approved product (Lead Sync, Community Management, or Talent/Apply Connect).
- The relevant OAuth scope granted to your app:
  - Lead Sync → `r_marketing_leadgen_automation`
  - Community Management → `rw_organization_admin`
- A **public HTTPS** endpoint. Non-HTTPS URLs and **ngrok are not supported**. LinkedIn recommends serverless/lambda endpoints; for local development use a supported tunnel (see below).

## Get Your Signing Secret

LinkedIn signs webhooks with your app's **`clientSecret`** — there is no separate webhook secret.

1. Developer Portal → your app → **Auth** tab.
2. Copy the **Client Secret**.
3. Store it as `LINKEDIN_CLIENT_SECRET` in your environment.

> For parent/child (Apply Connect) integrations, the GET validation may include an `applicationId` query parameter. Use the `clientSecret` of the **challenged** child application when it is present.

## Register Your Endpoint

### Community Management and most products (UI)

1. Developer Portal → your app → **Webhooks** tab.
2. Add your HTTPS webhook URL (e.g. `https://api.example.com/webhooks/linkedin`).
3. LinkedIn immediately sends a `GET ?challengeCode=<uuid>` to validate ownership. Your endpoint must echo the challenge (see [verification.md](verification.md)) within **3 seconds**.
4. Create the subscription: `PUT /rest/eventSubscriptions` with `eventType` = `ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS`.

### Lead Sync (API only)

Lead Sync webhooks **cannot** be created in the UI. Create the subscription via the Lead Notification Subscriptions API:

```
POST /rest/leadNotifications
```

Notifications for this subscription are delivered as `LEAD_ACTION`. From **2026-03-16**, unvalidated Lead Sync webhooks stop receiving notifications, so make sure the GET challenge succeeds.

## Re-validation and Blocked Endpoints

- LinkedIn re-validates registered endpoints **every 2 hours**.
- After **3 consecutive** failed validations the endpoint moves to `BLOCKED` and events stop.
- Developers receive warning emails per failure and a final block notification.
- Unblock by fixing the endpoint and re-running validation from the Developer Portal, or (for provisioned child apps) via the DeveloperWebhooks `revalidateWebhook` action:

```
POST https://api.linkedin.com/v2/developerWebhooks?action=revalidateWebhook
X-RestLi-Method: action
X-RestLi-Protocol-Version: 2.0.0

{ "application": "urn:li:developerApplication:12345678", "webhook": "{webhook_url}" }
```

## Retrieving Missed Notifications

If your endpoint was down, pull missed notifications for up to **60 days** via the product's pull API. The official `linkedin-api-client` SDK (Node and Python) helps call these REST endpoints — note it does **not** provide webhook signature verification, so verify manually (see [verification.md](verification.md)).

## Test Mode

LinkedIn has no dedicated webhook test mode. To exercise your handler:

- Trigger real actions (submit a Lead Gen Form, comment on org content).
- Use the Hookdeck CLI to tunnel and inspect deliveries locally:

```bash
npx hookdeck-cli listen 3000 linkedin --path /webhooks/linkedin
```
