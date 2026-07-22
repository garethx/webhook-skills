# Setting Up Polar Webhooks

## Prerequisites

- A [Polar](https://polar.sh) organization (use [sandbox.polar.sh](https://sandbox.polar.sh) for testing)
- Your application's webhook endpoint URL (publicly reachable, or a tunnel — see Local Development)

## Register Your Endpoint

Webhook endpoints are configured per organization:

1. Go to your Polar **Organization Settings → Webhooks**.
2. Click **Add Endpoint**.
3. **URL** — enter your handler's URL, e.g. `https://your-app.com/webhooks/polar`.
4. **Format** — choose **Raw**. Only the Raw format sends the JSON payload with signature
   headers for verification. (Discord/Slack formats send channel messages, not verifiable
   payloads — if you paste a Discord or Slack webhook URL the format is auto-selected.)
5. **Secret** — set a signing secret, or let Polar generate a random one. Copy it; you'll put it
   in `POLAR_WEBHOOK_SECRET`. Polar secrets are plain strings — **not** `whsec_`-prefixed.
6. **Events** — subscribe to the specific event types you want to receive (e.g. `order.paid`,
   `subscription.created`, `subscription.revoked`).
7. Save.

## Get Your Signing Secret

The signing secret is the one you set (or that Polar generated) in step 5 above. You can view it
again from the endpoint's settings. Store it as an environment variable:

```bash
POLAR_WEBHOOK_SECRET=your_webhook_signing_secret
```

This single secret is all you need to verify signatures — webhook verification does **not**
require a Polar API access token.

## Sandbox vs Production

Polar provides a separate **sandbox** environment at `sandbox.polar.sh` with its own
organizations, products, and webhook endpoints. Use it to test purchases, subscriptions, and
refunds without real charges. Sandbox and production have independent webhook secrets — make sure
`POLAR_WEBHOOK_SECRET` matches the environment you're testing against.

## Local Development

To receive webhooks on your machine, expose your local handler with a tunnel.

**Hookdeck CLI** (no account required, includes a request inspector):

```bash
npx hookdeck-cli listen 3000 polar --path /webhooks/polar
```

Use the URL it prints as your endpoint URL in the Polar dashboard.

**Polar CLI** (first-party):

```bash
polar listen http://localhost:3000/
```

## Test Your Endpoint

After saving an endpoint, trigger a real event (e.g. complete a sandbox checkout) or use the
endpoint's delivery logs in the dashboard to inspect attempts, responses, and retries.
