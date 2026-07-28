# Setting Up Smile API Webhooks

## Prerequisites

- A Smile API (getsmileapi.com) account with access to the developer portal
- A publicly reachable **HTTPS** endpoint for your webhook receiver
- Your API credentials (for registering webhooks via the API)

## Register a Webhook

You can register a webhook two ways.

### Option A — Developer Portal

1. Go to [portal.getsmileapi.com/webhooks](https://portal.getsmileapi.com/webhooks).
2. Click **Add New Webhook**.
3. Enter:
   - **URL** — your HTTPS endpoint (e.g. `https://api.example.com/webhooks/smile`).
   - **Secret** — a 1–64 character string used as the HMAC-SHA512 key. Store the
     same value in your app as `SMILE_WEBHOOK_SECRET`.
   - **Events** — the event types to subscribe to (or `ALL_EVENTS` for all).
   - **Active** — must be enabled for the webhook to fire.
   - **Include payload** — optional; see below.

### Option B — API

```
POST /webhooks
Content-Type: application/json

{
  "url": "https://api.example.com/webhooks/smile",
  "events": ["ACCOUNT_CONNECTED", "TASK_FINISHED", "INCOMES_ADDED"],
  "secret": "your_webhook_secret",
  "active": true,
  "includePayload": false
}
```

Use `"events": ["ALL_EVENTS"]` to subscribe to everything.

## The Signing Secret

The **secret** you set at registration is the HMAC-SHA512 key. Smile signs the
raw request body with it and sends the hex digest in the `Smile-Signature`
header. Keep the secret out of source control:

```bash
SMILE_WEBHOOK_SECRET=your_webhook_secret
```

Each endpoint has its own secret, so you can rotate one endpoint without
affecting others.

## includePayload

`includePayload` applies to **`TASK_FINISHED`** and
**`ACCOUNT_SYNC_TASK_FINISHED`** only. When `true`, Smile inlines the full data
(up to **300 list items**) into the event's `data` object, so you can process it
without a follow-up API call. When `false` (the default), fetch the data from
the Smile API using the ids in the event.

## Static Egress IP

Smile delivers webhooks from a **static IP: `18.142.61.230`** over HTTPS only.
You may allowlist this IP at your firewall / load balancer as a defense-in-depth
layer. It does **not** replace signature verification — always verify the
`Smile-Signature` header.

## Retries & Idempotency

Smile expects a `2xx` response. If it does not receive one, it **retries up to 2
times**, a few dozen seconds apart (at-least-once delivery). Make your handler
**idempotent** by deduping on the event `id` so retried deliveries are safe.

## Test Your Endpoint

For local development, tunnel deliveries to your machine with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 smile --path /webhooks/smile
```

No account required — the CLI creates a guest account and gives you a public URL
(register it as your webhook URL) plus a web UI for inspecting requests.
