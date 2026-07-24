# Setting Up Treezor Webhooks

## Prerequisites

- A Treezor account with API credentials (client ID / access token for the
  environment you target)
- Your `webhook_secret` — **provided by your Treezor Account Manager**, not
  self-generated in a dashboard
- A publicly reachable HTTPS endpoint (use the [Hookdeck CLI](#local-testing) or
  ngrok while developing)

## Get Your Webhook Secret

Unlike many providers, Treezor does not expose a self-service signing secret in a
dashboard. Ask your **Treezor Account Manager** for the `webhook_secret` for each
environment (Sandbox and Production have different secrets). Store it as
`TREEZOR_WEBHOOK_SECRET`.

## Webhook Management Host

Webhook subscriptions are managed on a **dedicated host**, separate from the main
Treezor API:

| Environment | Host |
|-------------|------|
| Production  | `https://webhook.api.treezor.co` |
| Sandbox     | `https://webhook.sandbox.treezor.co` |

## Register Your Endpoint

Create a subscription with `POST /settings/hooks`, pointing at your receiver URL:

```bash
curl -X POST https://webhook.sandbox.treezor.co/settings/hooks \
  -H "Authorization: Bearer $TREEZOR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.example.com/webhooks/treezor"
  }'
```

The response includes the subscription `uuid`. **New subscriptions start in a
`PENDING` state** and may require Treezor to activate them before deliveries begin —
coordinate with your Account Manager if the subscription stays pending.

## Choose Which Events to Receive

Manage the events on a subscription through its events sub-resource:

```bash
# Add events to a subscription
curl -X POST https://webhook.sandbox.treezor.co/settings/hooks/{uuid}/events \
  -H "Authorization: Bearer $TREEZOR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "events": ["payin.create", "cardtransaction.create", "user.kycreview"] }'
```

Use `GET /settings/hooks/{uuid}/events` to list current subscriptions and the
`DELETE` variant to unsubscribe from specific events. Event names use the
`object.action` form (see [overview.md](overview.md)).

## Authentication for Managing Webhooks

Calls to the webhook management host are authenticated with your Treezor API
credentials (bearer access token), the same way you authenticate other Treezor API
calls. The **inbound webhooks themselves** are authenticated differently — they carry
the `object_payload_signature` field, which you verify with your `webhook_secret`
(see [verification.md](verification.md)).

## Responding to Deliveries

- Return **HTTP 200** once you have verified and accepted the webhook.
- Return a **5xx** status to signal failure — Treezor retries **every minute, up to
  30 attempts**.
- Because retries and network conditions can cause **duplicate** deliveries and
  **out-of-order** arrival, dedupe on `webhook_id` and compare `webhook_created_at`.

## Local Testing

Forward webhooks to your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 treezor --path /webhooks/treezor
```

This prints a public URL — register it (or the URL it forwards through) as your
subscription's `url`. The CLI also gives you a web UI to inspect and replay requests.
