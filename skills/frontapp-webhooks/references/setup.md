# Setting Up Front Webhooks

## Prerequisites

- A Front account with access to build a Front **app** (partner / Core API app), or admin
  access to configure rule webhooks.
- Your application's publicly reachable webhook endpoint URL (e.g.
  `https://your-domain.com/webhooks/frontapp`). For local development, use a tunnel — see
  "Local Development" below.

## Application Webhooks (recommended)

Application webhooks are configured on a Front app and are the modern, signed, retrying
webhook system this skill implements.

### 1. Get Your Signing Key

1. Go to the [Front Developer](https://dev.frontapp.com/) area and open (or create) your app.
2. Add the **Webhooks** capability / feature to the app.
3. Front provisions a **signing key** (also called the app "token") for the app. Copy it —
   this is the HMAC key used to compute `X-Front-Signature`.
4. Store it as `FRONT_WEBHOOK_SECRET` in your environment. Never commit it.

### 2. Register Your Endpoint & Events

1. Add your endpoint URL to the app's webhook configuration.
2. Subscribe to the events you care about (e.g. `inbound`, `outbound`, `move`, `assign`,
   `tag`, `comment`, `message_bounce_error`).

### 3. The Subscription Validation Challenge

When you register or update the subscription, Front sends a **validation request** to your
endpoint containing an `X-Front-Challenge` header. Your endpoint must respond within
**10 seconds** with HTTP `200` and echo the challenge value, using any of:

- `Content-Type: text/plain` with the challenge value as the body
- `Content-Type: application/x-www-form-urlencoded` with `challenge=<value>`
- `Content-Type: application/json` with `{"challenge": "<value>"}`

The examples in this skill detect the `X-Front-Challenge` header and reply automatically.

### 4. Delivery, Retries & Auto-Disable

- Front expects a `2xx` acknowledgement within **5 seconds**.
- On `408`, `429`, `500`, or a timeout, Front **retries up to 3 times**.
- If deliveries keep failing, Front **automatically disables** the webhook.

Acknowledge fast (return `200` immediately) and do heavy processing asynchronously.

## Rule Webhooks (legacy)

Rule webhooks are configured as a rule action, not on an app, and use a **different**
verification scheme (HMAC-**SHA1**, base64, over the body only, keyed with the "API Secret"
from the Webhooks app, 5s timeout, **no retries**). Useful for quick testing but not the
target of this skill's examples.

1. Front Settings → **Rules** → create/edit a rule.
2. Add a **Send to webhook** action with your endpoint URL.
3. Get the **API Secret** from Settings → **Integrations** → **Webhooks** (the "API Secret"
   field) to verify the HMAC-SHA1 signature.

## Local Development

Front must reach your endpoint over HTTPS. Use the Hookdeck CLI to tunnel to localhost —
no account required, and it gives you a web UI to inspect and replay requests:

```bash
npx hookdeck-cli listen 3000 frontapp --path /webhooks/frontapp
```

Use the printed HTTPS URL as your endpoint in the Front app webhook configuration.

## Documentation

- [Front Webhooks](https://dev.frontapp.com/docs/webhooks-1)
- [Front Application Webhooks & verification](https://dev.frontapp.com/docs/application-webhooks)
