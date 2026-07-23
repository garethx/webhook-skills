# Setting Up Attentive Webhooks

## Prerequisites

- An Attentive account with access to the custom app / integrations settings
- Your application's public HTTPS webhook endpoint URL (e.g.
  `https://your-app.com/webhooks/attentive`)

Attentive offers two ways to configure webhooks. Both deliver identical payloads
and sign with the same `x-attentive-hmac-sha256` header.

## Option A: Dashboard (Universal webhooks)

1. Go to the Attentive integrations setup page and select your **custom app**.
2. Open the **Webhooks** tab.
3. Enable the **Event Webhook Status** toggle.
4. Choose **Universal webhook** as the webhook type.
5. Enter your **HTTPS URL** (e.g. `https://your-app.com/webhooks/attentive`).
6. **Save the signing key** ("client secret") shown for this webhook somewhere
   secure — this is the secret you use to verify signatures. Attentive generates
   a unique signing key per webhook.
7. Select the events you want to receive (e.g. `sms.subscribed`,
   `sms.unsubscribed`, `email.opened`).
8. Click **Save**.

## Option B: Webhooks API (Subscription webhooks)

Create webhook subscriptions programmatically with `POST /webhooks`. Each
subscription targets specific event types and returns a signing key you use to
verify incoming requests. Authenticate API calls with your Attentive API token
(sent as a bearer token). See the
[Attentive API docs](https://docs.attentive.com/) for the exact request schema.

## Get Your Signing Key

The **signing key** (a.k.a. "client secret") is shown in the webhook settings
when you create the webhook (dashboard) or returned in the API response
(subscription). Store it as an environment variable — never commit it:

```bash
ATTENTIVE_WEBHOOK_SECRET=your_signing_key
```

Signature verification is optional but **strongly recommended**. Without it, any
party who learns your endpoint URL could post forged events.

## Testing Your Endpoint

- The dashboard provides an **example payload** you can send to your endpoint
  while configuring the webhook.
- For local development, tunnel public traffic to your local server with the
  Hookdeck CLI (no account required):

  ```bash
  npx hookdeck-cli listen 3000 attentive --path /webhooks/attentive
  ```

  Use the printed URL as your webhook URL in the Attentive settings.

## Retry & Auto-Disable Behavior

- Failed deliveries (non-2xx) are retried with exponential backoff for up to
  **3 days**.
- Endpoints that keep failing for multiple consecutive days are **automatically
  disabled** — monitor your endpoint's health and return 2xx promptly.
- Event delivery order is **not guaranteed**; process events idempotently.
