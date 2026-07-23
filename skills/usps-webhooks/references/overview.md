# USPS Webhooks Overview

## What Are USPS Webhooks?

USPS delivers webhooks through the **Subscriptions - Tracking API (v3.2)**.
Instead of polling the Tracking API for every package, you create a
**subscription** that tells USPS where to send updates. When a tracked package
changes state, USPS POSTs a **notification** to your `listenerURL`.

The flow:

1. Get an OAuth2 access token (client-credentials) to call the management API.
2. `POST /subscriptions` with a `listenerURL`, `filterProperties` (by Mailer ID
   or tracking number), an event filter, and an optional 32-char `secret`.
3. USPS POSTs a notification envelope to your listener whenever a matching
   package updates.
4. You verify the `X-HMAC` signature, parse the payload, and process the event.

The OAuth token is used **only** to manage subscriptions — it is **not** sent
with delivered notifications. Per-message authenticity comes from the `X-HMAC`
signature and/or IP allowlisting.

## The Notification Envelope

Every notification is a JSON envelope:

```json
{
  "subscriptionId": "a1b2c3d4-...",
  "subscriptionType": "TRACKING",
  "timestamp": "2026-07-23T14:32:00Z",
  "payload": "{\"trackingNumber\":\"9400100000000000000000\",\"status\":\"Delivered\"}",
  "links": [{ "rel": "self", "href": "https://api.usps.com/..." }]
}
```

| Field | Description |
|-------|-------------|
| `subscriptionId` | The subscription that produced this notification |
| `subscriptionType` | Which payload schema the `payload` string holds. `TRACKING` is the confirmed value; a scan-event-extract type also exists (see below) |
| `timestamp` | ISO-8601 time USPS generated the notification. **Part of the signed content** |
| `payload` | **Stringified JSON** with the tracking details. `JSON.parse()` after verifying. **Part of the signed content** |
| `links` | HATEOAS links (e.g. to fetch full tracking detail from the Tracking API) |

> **Semi-thin payloads:** the `payload` carries a status summary and recent
> tracking events. For the complete tracking history, call the
> [USPS Tracking API](https://developers.usps.com/trackingv3) using the
> tracking number (or follow the `links`).

## Event Types Are Really Two Payload Schemas

USPS has no event-name enum in the sense most providers do. The subscribable
**event filter** exposes a single value, `ALL_UPDATES`, so USPS sends a
notification for **every** update on the packages you subscribed to. What varies
between notifications is the **shape of the `payload` string**, and the envelope
`subscriptionType` tells you which shape you got.

There are **two** documented notification schemas:

| Schema | What the `payload` string contains |
|--------|------------------------------------|
| **Tracking Subscription Event** | A tracking summary for one item: the tracking number, its current status, and recent `trackingEvents`. This is the `TRACKING` `subscriptionType` and the one most integrations want. |
| **Scan Event Extract Subscription Event** | A single raw scan record as captured by the USPS network — one physical scan (event code, date/time, facility/ZIP, tracking number) rather than a rolled-up status. Used for feed-style ingestion where you want every scan as its own message. |

> **Unconfirmed:** the exact `subscriptionType` string USPS sends for the scan
> event extract schema, and the precise field names inside that payload, could
> not be verified from the developer portal (it is a JS-rendered SPA and the
> schema was not fully readable). `TRACKING` is confirmed. Log the first
> delivery of each subscription you create, then add an explicit branch — and
> always keep a fallback branch for a `subscriptionType` you do not recognize.

Handlers therefore dispatch first on `subscriptionType` to pick a schema, and
then — for the tracking schema — on the `status` inside the parsed payload.

## Tracking Statuses (Tracking Subscription Event)

| Tracking status | Triggered when | Common use cases |
|-----------------|----------------|------------------|
| `Pre-Shipment` | Shipping label created, USPS awaiting the item | Show "label created" in the customer's order status |
| `Accepted` | USPS has taken possession of the item | Mark order as shipped/in-network |
| `In Transit` | Item is moving through the USPS network | Update ETA, live tracking timeline |
| `Out for Delivery` | Item is out for delivery today | Send "arriving today" notification |
| `Delivered` | Item was delivered | Close the shipment, request a review, release funds |
| `Available for Pickup` | Item is held at a facility for pickup | Notify customer to collect the package |
| `Delivery Attempt` | Delivery was attempted but not completed | Prompt customer to reschedule / update address |
| `Alert` | Exception or delay requiring attention | Alert support, notify customer of a delay |

> The authoritative tracking payload schema and status values are defined by the
> USPS Tracking API. Treat the table above as the common milestones and always
> keep a `default` branch for statuses your code does not recognize.

## Retry, Suspension & Expiry Behavior

USPS does **not** publish a per-message delivery-retry schedule. Design for
these behaviors:

- **Unreachable listener → `SUSPENDED`.** If USPS cannot reach your listener
  URL, the subscription is set to `SUSPENDED` and stops delivering. You must
  re-activate it once your endpoint is healthy.
- **Inactivity auto-delete.** A subscription is automatically deleted after
  **30 days** of inactivity, with a warning notification at **25 days**.
- **Listener limit.** A maximum of **10 listener URLs** are allowed per Home
  CRID.

Because there is no guaranteed retry, respond quickly with `2xx`, do heavy work
asynchronously, and reconcile missed updates by calling the Tracking API when
needed. A gateway like Hookdeck adds durable retries and replay in front of your
handler.

## Full Event Reference

For the complete subscription and notification reference, see the
[USPS Subscriptions - Tracking API documentation](https://developers.usps.com/subscriptions-trackingv3r2).
For the tracking payload schema, see the
[USPS Tracking API documentation](https://developers.usps.com/trackingv3).
