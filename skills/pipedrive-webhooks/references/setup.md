# Setting Up Pipedrive Webhooks

## Prerequisites

- A Pipedrive account (admin access to create webhooks).
- A **publicly accessible HTTPS** endpoint (self-signed certificates are not
  supported). For local development, use a tunnel — see below.
- Credentials you choose for HTTP Basic Auth (`http_auth_user` /
  `http_auth_password`). Treat the password like a secret.

## Option A: Create a Webhook in the Dashboard

1. Go to **Settings → Tools and apps → Webhooks** (or **Company settings →
   Webhooks**).
2. Click **Create new webhook**.
3. Fill in:
   - **Event action** — `create`, `change`, `delete`, or `*` (all).
   - **Event object** — the entity (`deal`, `person`, `activity`, …) or `*` (all).
   - **Endpoint URL** — your HTTPS URL, e.g. `https://your-app.com/webhooks/pipedrive`.
   - **HTTP Auth username / password** — set both. Pipedrive will send these as
     Basic Auth on every delivery. Store the same values in your app as
     `PIPEDRIVE_WEBHOOK_USER` and `PIPEDRIVE_WEBHOOK_PASSWORD`.
   - **Version** — choose **2.0** (default).
4. Save. Pipedrive begins delivering matching events immediately.

## Option B: Create a Webhook via the API

`POST https://api.pipedrive.com/v1/webhooks` with your API token. `version`
defaults to `2.0`.

### curl

```bash
curl -X POST "https://api.pipedrive.com/v1/webhooks?api_token=$PIPEDRIVE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription_url": "https://your-app.com/webhooks/pipedrive",
    "event_action": "*",
    "event_object": "deal",
    "http_auth_user": "my-webhook-user",
    "http_auth_password": "a-long-random-secret",
    "version": "2.0"
  }'
```

### Node SDK (`pipedrive` v33)

The Express and Next.js examples include a `register-webhook.js` helper that uses
the official SDK:

```javascript
const { Configuration, WebhooksApi } = require('pipedrive/v1');

const config = new Configuration({ apiKey: process.env.PIPEDRIVE_API_TOKEN });
const webhooks = new WebhooksApi(config);

await webhooks.addWebhook({
  AddWebhookRequest: {
    subscription_url: process.env.PIPEDRIVE_SUBSCRIPTION_URL,
    event_action: '*',        // create | change | delete | *
    event_object: 'deal',     // deal | person | activity | ... | *
    http_auth_user: process.env.PIPEDRIVE_WEBHOOK_USER,
    http_auth_password: process.env.PIPEDRIVE_WEBHOOK_PASSWORD,
    version: '2.0',
  },
});
```

## Get an API Token

For Option B you need an API token:

1. Go to **Settings → Personal preferences → API**.
2. Copy your **personal API token** into `PIPEDRIVE_API_TOKEN`.

(OAuth access tokens also work for marketplace apps.)

## Managing Webhooks

- **List:** `GET /v1/webhooks`
- **Delete:** `DELETE /v1/webhooks/{id}`

## Local Development

Pipedrive requires a public HTTPS URL, so expose your local server with a tunnel.
Using the Hookdeck CLI (no account required, creates a guest account on first run):

```bash
npx hookdeck-cli listen 3000 pipedrive --path /webhooks/pipedrive
```

Use the printed HTTPS URL as your `subscription_url` when creating the webhook.

## Keep the Webhook Alive

- Return a `2XX` status quickly — Pipedrive treats anything else as a failure.
- **10 first-attempt failures** → 30-minute suspension.
- **No successful delivery for 3 consecutive days** → the webhook is auto-deleted.
