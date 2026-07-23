# Setting Up Lithic Webhooks

## Prerequisites

- A Lithic account with dashboard access
- Your application's public webhook endpoint URL (e.g. `https://api.example.com/webhooks/lithic`)

## Create an Event Subscription

Lithic delivers events to **event subscriptions**. Each subscription has its own
URL and its own signing secret.

1. Go to the [Lithic Dashboard](https://dashboard.lithic.com/) → **Developers** →
   **Webhooks / Event Subscriptions**.
2. Click **Add / Create subscription**.
3. Enter your endpoint URL.
4. Select the event types you want to receive (see
   [overview.md](overview.md) for the full list) — subscribe only to what you
   handle to reduce noise.
5. Save the subscription.

You can also manage subscriptions programmatically via the Events API
(`POST /event_subscriptions`).

## Get Your Signing Secret

After creating the subscription, Lithic shows a **signing secret** that starts
with `whsec_`. This secret is **per-subscription** — each subscription has a
distinct secret.

1. Copy the `whsec_...` secret.
2. Store it as `LITHIC_WEBHOOK_SECRET` in your environment (never commit it).

The secret is used to compute the HMAC — the part after the `whsec_` prefix is
base64-decoded to form the HMAC key (the official SDK handles this for you).

## Environment Variables

```bash
LITHIC_WEBHOOK_SECRET=whsec_xxxxx   # Per-subscription signing secret
LITHIC_API_KEY=your_api_key         # Only needed to call the Lithic API
```

The API key is **not** required to verify webhooks — verification only needs the
signing secret. It is included because the official SDK client reads it and you
often call the API to fetch related resources.

## Test Mode vs Live Mode

Lithic provides **sandbox** and **production** environments with separate
dashboards, API keys, and event subscriptions. Configure a subscription in each
environment you use. Test end-to-end in sandbox before pointing production
traffic at your endpoint.

## Rotating Secrets

Rotate the signing secret from the subscription's settings in the dashboard. To
rotate without downtime:

1. Generate/roll a new secret in the dashboard.
2. Deploy code that accepts **either** the old or new secret during a short
   overlap window.
3. Once all in-flight deliveries use the new secret, remove the old one.

## Delivery Failures

Failed deliveries retry with exponential backoff. A subscription that fails
continuously for **5 days** is automatically disabled — monitor your endpoint's
health and re-enable subscriptions after an outage.

## Receiving Webhooks Locally

Use the Hookdeck CLI to tunnel events to your machine — no account required:

```bash
npx hookdeck-cli listen 3000 lithic --path /webhooks/lithic
```

The CLI prints a public URL to register as your subscription URL, plus a web UI
to inspect and replay requests.
