# Setting Up Courier Webhooks

## Prerequisites

- A [Courier](https://app.courier.com/) account with access to workspace settings
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/courier`)

## Register Your Endpoint

1. Go to the Courier dashboard → **Settings** → **General**
   (`https://app.courier.com/settings/general`).
2. Under the webhooks section, click **+ Outbound Webhook**.
3. Enter your endpoint URL (the route that receives `POST` requests, e.g.
   `https://your-app.com/webhooks/courier`).
4. Select the events you want to receive (see [overview.md](overview.md) for the list),
   for example `message:updated`, `notification:submitted`, `audiences:user:matched`.
5. Save the webhook.

## Get Your Signing Secret

When you create the webhook, Courier provides a **webhook signing secret**. Copy it and
store it as an environment variable in your application:

```bash
COURIER_WEBHOOK_SECRET=your_webhook_signing_secret
```

This secret is the HMAC key used to compute and verify the `courier-signature` header.
Never commit it to source control — load it from the environment.

## Test Environment vs Production

Webhooks are **scoped to the environment where they are created**:

- A webhook created in the **test** environment receives only **test** events.
- A webhook created in **production** receives only **production** events.

If you want to receive events in both, create a separate webhook in each environment.
Each environment has its own signing secret.

## Verify It Works

1. Deploy your handler (or expose it locally with a tunnel — see below).
2. Trigger an event in Courier — for example, send a test notification so a
   `message:updated` event fires, or publish a template for `notification:published`.
3. Confirm your endpoint receives the `POST`, verifies the `courier-signature` header,
   and returns `200`.

## Local Development

Expose your local server to Courier with the Hookdeck CLI (no account or install required):

```bash
npx hookdeck-cli listen 3000 courier --path /webhooks/courier
```

This creates a local tunnel and a web UI for inspecting requests. Use the printed URL as
your webhook endpoint in the Courier dashboard while developing. For FastAPI, use port
`8000` instead of `3000`.

## Next Steps

- See [verification.md](verification.md) for signature verification details and gotchas.
- See the [examples/](../examples/) directory for complete, tested handlers.
