# Setting Up Statsig Webhooks

## Prerequisites

- A Statsig project where you have permission to manage integrations
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI or ngrok for local dev)

## 1. Open the Generic Webhook Integration

1. In the Statsig console, go to **Project Settings → Integrations**.
2. Find **Generic Webhook** (this is the "Event Webhook") and add/enable it.

## 2. Enter Your Destination URL

1. In the Generic Webhook integration card, enter your public endpoint in the
   **destination URL** field, e.g. `https://your-domain.com/webhooks/statsig`.
2. Save the integration.
3. On save, Statsig POSTs a **URL validation request** to the endpoint:
   `{ "data": { "event": "url_verification", "verification_code": "..." } }`.
   Your endpoint must already be running and reply `200` with
   `{ "verification_code": "<the same value>" }`, or the webhook silently never
   registers — see
   [verification.md](verification.md#url-validation-handshake).

## 3. Choose What to Receive (Event Filtering)

Use **Event Filtering** on the integration to select which activity Statsig
sends:

- **Exposures** — delivered as a top-level JSON array of exposure events.
- **Config Changes** — delivered wrapped in a `{ "data": [...] }` envelope,
  each item carrying `type` / `name` / `description` / `action` metadata.

You can enable either or both. See [overview.md](overview.md) for the payload
shapes.

## 4. Get Your Signing Secret

The **signing secret** is used to verify that incoming requests really come from
Statsig.

1. On the **Webhook integration card** (Project Settings → Integrations →
   Generic Webhook), locate the **signing secret**.
2. Copy it and set it as `STATSIG_WEBHOOK_SECRET` in your environment.

> Treat this like a password. Never commit it; never log it.

## 5. Test the Endpoint

Trigger real activity:

- Toggle or edit a feature gate / experiment / dynamic config → produces a
  **Config Change** event.
- Evaluate a gate for a user in your app → produces an **Exposure** event (if
  exposures are enabled).

Then check your server logs to confirm delivery and successful signature
verification.

## Local Development

Use the Hookdeck CLI to forward Statsig events to a local server — no account or
ngrok tunnel required:

```bash
npx hookdeck-cli listen 3000 statsig --path /webhooks/statsig
```

Paste the URL Hookdeck prints into the **destination URL** field of the Generic
Webhook integration.
