# Setting Up Solidgate Webhooks

## Prerequisites

- A Solidgate account with access to the [Solidgate Hub](https://hub.solidgate.com/)
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/solidgate`)

## Get Your Webhook Keys

Webhook keys are a **separate pair** from your API keys and are used only for
validating webhook payloads.

1. Go to **Solidgate Hub → Developers**.
2. Locate the **webhook keys**:
   - **Public key** — prefix `wh_pk_`. This is the value Solidgate sends in the
     `merchant` header.
   - **Secret key** — prefix `wh_sk_`. This is used to compute the HMAC signature.
3. Copy both into your environment:

   ```bash
   SOLIDGATE_WEBHOOK_PUBLIC_KEY=wh_pk_xxxxx
   SOLIDGATE_WEBHOOK_SECRET_KEY=wh_sk_xxxxx
   ```

> Do **not** use your API keys (`api_pk_` / `api_sk_`) for webhook verification —
> the webhook signature is computed with the `wh_pk_` / `wh_sk_` pair.

## Register Your Endpoint

Webhook endpoints are configured per channel:

1. Go to **Solidgate Hub → Developers → Channels**.
2. Select the channel you want to receive events from.
3. Open the **Webhooks** section.
4. Click **Add endpoint**.
5. Enter your handler URL and select the events you want to receive
   (e.g. `card_gate.order.updated`, `subscription.updated.v2`).
6. Confirm to activate the endpoint. You can edit the URL and event selection later.

## Delivery & Retries

- Your endpoint must respond with a **2xx** status within **30 seconds**.
- If it does not, Solidgate retries up to **8 times** with increasing backoff:
  **15m, 30m, 1h, 2h, 4h, 8h, 16h, 24h**.
- Retried deliveries reuse the same `solidgate-event-id`, so deduplicate on that
  header to stay idempotent.

## Test Mode vs Live Mode

Solidgate provides separate test and live channels, each with their own webhook
keys. Use your **test channel** credentials while integrating, then switch to the
live channel keys for production. Because keys differ per environment, keep
`SOLIDGATE_WEBHOOK_PUBLIC_KEY` / `SOLIDGATE_WEBHOOK_SECRET_KEY` environment-specific.

## Local Testing

Use the Hookdeck CLI to receive live webhooks on your local machine — no account
required:

```bash
npx hookdeck-cli listen 3000 solidgate --path /webhooks/solidgate
```

This creates a public tunnel URL you can register as your endpoint in the Hub, and
provides a web UI to inspect and replay requests.
