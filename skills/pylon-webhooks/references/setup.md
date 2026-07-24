# Setting Up Pylon Webhooks

## Prerequisites

- A Pylon account with access to **API settings** (admin-level access).
- Your application's public webhook endpoint URL (e.g.
  `https://your-app.com/webhooks/pylon`). For local development use the Hookdeck
  CLI tunnel (see below).

## Create a Webhook Destination

1. Sign in to Pylon and open **Settings → API** (the developer/API settings area).
2. Go to **Webhooks / Webhook destinations** and create a new destination.
3. Enter your endpoint **URL** (the route your handler listens on, e.g.
   `/webhooks/pylon`).
4. Select **one or more event types** you want delivered (e.g. issue events).
   > The exact event names are shown in this configuration screen — treat the
   > list here as the source of truth, since the public docs do not enumerate a
   > confirmed catalog.
5. Save the destination.

## Get Your Signing Secret

When you create the destination, Pylon displays the **secret** for that
destination **once, on screen**. Copy it immediately and store it securely —
you cannot retrieve it again later (you would have to rotate/recreate the
destination).

Set it as an environment variable for your handler:

```bash
PYLON_WEBHOOK_SECRET=<the-secret-shown-once>
```

Each destination has its own secret. If you run multiple destinations, keep a
secret per destination.

## Headers Pylon Sends

Every delivery includes:

| Header | Example | Notes |
|--------|---------|-------|
| `Pylon-Webhook-Signature` | `hs256=9f8c…` | HMAC-SHA256, `hs256=` prefix + hex digest |
| `Pylon-Webhook-Timestamp` | `1624235417` | Unix seconds; part of the signed content |
| `Pylon-Webhook-Version` | `2021-07` | Payload schema version |
| `Content-Type` | `application/json` | |
| `User-Agent` | `Pylon Webhooks` | |

## Verify Deliveries

Your endpoint should return a `2xx` quickly (within ~10s) once the signature is
verified. Verify against the **raw** request body — see
[verification.md](verification.md).

## Test Mode / Local Development

Pylon does not provide a separate test-mode secret; a destination is either
active or `inactive`. To develop locally, forward events through the Hookdeck CLI
so you get a public URL that tunnels to `localhost`:

```bash
npx hookdeck-cli listen 3000 pylon --path /webhooks/pylon
```

Put the URL Hookdeck prints into your Pylon destination's URL field, then trigger
an event in Pylon (e.g. create or update an issue) to see a delivery.

## Monitoring

- A destination flips to **`inactive`** after **7 days** with no successful
  deliveries — check the destination's status if events stop arriving.
- Pylon retries failed deliveries up to **5 times** with exponential backoff
  (final attempt ~31h after the event), so make your handler idempotent.
