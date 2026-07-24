# Setting Up Akeneo Webhooks

## Prerequisites

- An Akeneo PIM instance on **5.0+ / SaaS** (the Events API is not available on
  older self-hosted versions)
- Admin access to **Connect → Connection settings**
- Your application's public webhook endpoint URL (e.g. `https://example.com/webhooks/akeneo`)

## Enable the Event Subscription

1. In the PIM, go to **Connect → Connection settings**.
2. Open the connection you want to receive events from (or create a new one).
3. Select the **Event subscription** tab.
4. Toggle **event subscription on**.
5. Enter your **Request URL** — the single endpoint that will receive **all**
   event types for this connection.
6. Save. Akeneo may send a test request to confirm the endpoint responds with a 2xx.

> A connection has exactly **one** Request URL, and it receives every product and
> product-model event. There is no per-event endpoint or event selection — dispatch
> by the `action` field in your handler.

## Get Your Signing Secret

The signing secret is the connection **secret** shown on the connection's settings
page (the same `secret` used for API authentication). Copy it and store it as an
environment variable in your application:

```bash
AKENEO_WEBHOOK_SECRET=your_connection_secret
```

Akeneo uses this secret to sign every request with HMAC-SHA256. See
[verification.md](verification.md) for details.

## Delivery Behavior You Must Design For

Akeneo's Events API is fire-and-forget. Build your handler accordingly:

- **No retries.** If your endpoint is down or returns a non-2xx, the event is lost.
- **Events dropped after ~2h.** There is no long-term buffer.
- **Order not guaranteed.** Do not assume `created` arrives before `updated`.
- **High volume.** Up to ~40,000 events/hour, batched up to 10 per request.
- **Fast ack.** Return 2xx within ~500ms and process asynchronously.

To recover from downstream failures despite the lack of retries, place a durable
queue (or the [Hookdeck Event Gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway))
in front of your worker.

## Test Your Endpoint Locally

Use the Hookdeck CLI to tunnel Akeneo requests to your local server — no account
required:

```bash
npx hookdeck-cli listen 3000 akeneo --path /webhooks/akeneo
```

Point the connection's Request URL at the tunnel URL the CLI prints, then save a
product in the PIM to trigger a `product.updated` event.
