# Setting Up Statsig Webhooks

## Prerequisites

- Statsig account
- Your application's webhook endpoint URL (must be HTTPS in production)

## Configure the Event Webhook

1. In the Statsig console, go to your project's **Integrations** settings.
2. Find and enable the **Event Webhook** integration.
3. Enter your endpoint URL (e.g., `https://your-app.com/webhooks/statsig`).
4. Choose which event categories to stream (**Exposures** and/or **Config Changes**).
5. Save the configuration.

## Get Your Signing Secret

When you configure the Event Webhook, Statsig provisions a **signing secret**. This secret is used to verify that incoming requests genuinely originate from Statsig. Copy it and store it securely as `STATSIG_WEBHOOK_SECRET`.

## Local Development

Statsig requires a publicly reachable HTTPS endpoint. For local development, tunnel requests to your machine:

```bash
# Hookdeck CLI (no account needed)
npx hookdeck-cli listen 3000 statsig --path /webhooks/statsig
```

Or use ngrok:

```bash
ngrok http 3000
```

Use the public URL as your webhook endpoint while developing.

## Testing

Statsig provides a built-in **Webhook Debug** tool in the integration settings that lets you send test payloads and inspect the request/response for troubleshooting.

## Environment Variables

Store your signing secret securely:

```bash
# .env
STATSIG_WEBHOOK_SECRET=your_webhook_signing_secret_here
```

Never commit secrets to version control. Use environment variables or a secrets manager.

## Full Documentation

For complete setup instructions, see [Statsig's Event Webhook documentation](https://docs.statsig.com/integrations/event_webhook).
