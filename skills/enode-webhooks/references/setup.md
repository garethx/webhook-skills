# Setting Up Enode Webhooks

## Prerequisites

- An Enode account with API access (client credentials for the sandbox or production environment)
- Your application's webhook endpoint URL (HTTPS required in production)

## Generate a Webhook Secret

Enode does **not** generate or return a signing secret for you. **You** generate it and supply it when creating the webhook. It must be a pseudorandom value of **at least 128 bits** from a secure generator:

```bash
# 256-bit hex secret (recommended)
openssl rand -hex 32
```

Store this secret securely — you will need it both in the create request and in your application's `ENODE_WEBHOOK_SECRET` environment variable.

## Create a Webhook

Webhooks are created via the Enode API, not a dashboard form. Send a `POST /webhooks` request:

```bash
curl -X POST https://enode-api.production.enode.io/webhooks \
  -H "Authorization: Bearer $ENODE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/enode",
    "secret": "your_generated_secret",
    "events": [
      "user:vehicle:updated",
      "user:charger:updated",
      "user:battery:updated"
    ],
    "authentication": {
      "headerName": "X-My-Auth",
      "headerValue": "optional-shared-secret"
    }
  }'
```

Fields:

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | Your HTTPS endpoint that receives deliveries |
| `secret` | Yes | The secret you generated (min 128 bits); used to sign every delivery |
| `events` | Yes | Array of event names to subscribe to (see [overview.md](overview.md)) |
| `authentication` | No | Optional extra header (`headerName` / `headerValue`) Enode adds to every request so you can authenticate at a proxy/gateway |
| `apiVersion` | No | Pin the payload schema version |

The `secret` is write-only — Enode never returns it in API responses, so keep your own copy.

## Test the Webhook

Enode provides a **Test Webhook** endpoint that sends an `enode:webhook:test` event to your URL:

```bash
curl -X POST https://enode-api.production.enode.io/webhooks/{webhookId}/test \
  -H "Authorization: Bearer $ENODE_ACCESS_TOKEN"
```

Calling Test (or Update) also **reactivates** a webhook that was marked inactive after repeated delivery failures.

## Reactivate an Inactive Webhook

If your endpoint fails repeatedly, Enode marks the webhook **inactive** (see failure behavior below). To reactivate it, call either:

- `POST /webhooks/{webhookId}/test` — Test Webhook
- `PUT /webhooks/{webhookId}` — Update Webhook (send the updated config)

## Failure & Retry Behavior

- Each delivery attempt **times out after 5 seconds** — return `200` quickly and do heavy work asynchronously.
- **Production:** failed deliveries are retried over **24 hours** at increasing intervals. After that window, pending events are deleted and the webhook is marked **inactive**.
- **Sandbox:** a webhook is marked **inactive after ~5 minutes** of failures.
- Reactivate with the Test or Update endpoints (above).

## Sandbox vs Production

Enode has separate sandbox and production environments with different base URLs and credentials. Test your integration in the sandbox first; note the faster (~5 min) inactivation window there.

## Environment Variables

```bash
# .env
ENODE_WEBHOOK_SECRET=your_generated_secret
```

## Full Documentation

For complete setup instructions, see:
- [Enode Webhooks Guide](https://developers.enode.com/docs/webhooks)
- [Enode API Reference — Webhooks](https://developers.enode.com/api/reference#webhooks)
