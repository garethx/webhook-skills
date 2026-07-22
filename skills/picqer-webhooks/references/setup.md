# Setting Up Picqer Webhooks

Picqer has **no dashboard UI for webhooks**. Hooks are created and managed
entirely through the Picqer API.

## Prerequisites

- A Picqer account and your Picqer subdomain (e.g. `https://YOURSUBDOMAIN.picqer.com`)
- A Picqer API key (Settings → API keys in Picqer)
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/picqer`)

## Authentication

The Picqer API uses **HTTP Basic authentication**. Your **API key is the
username** and the password is left empty:

```bash
curl -u YOUR_API_KEY: https://YOURSUBDOMAIN.picqer.com/api/v1/...
```

(The trailing colon in `-u YOUR_API_KEY:` sends an empty password.)

The official SDK is **PHP-only** (`picqer/api-client` on Packagist). There is no
official npm or pip package, so the Node and Python examples call the REST API
directly and verify signatures manually.

## Create a Hook

`POST /api/v1/hooks` with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | A label for the hook |
| `event` | Yes | The event to subscribe to (e.g. `orders.completed`) |
| `address` | Yes | Your public endpoint URL |
| `secret` | **Optional** | Signing secret used to compute `X-Picqer-Signature` |

```bash
curl -u YOUR_API_KEY: https://YOURSUBDOMAIN.picqer.com/api/v1/hooks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Order completed hook",
    "event": "orders.completed",
    "address": "https://your-app.com/webhooks/picqer",
    "secret": "a-long-random-string"
  }'
```

> **Always set a `secret`.** It is optional, but if you omit it Picqer sends
> **no** `X-Picqer-Signature` header and you cannot verify that a request
> genuinely came from Picqer. Generate a long random value and store it as
> `PICQER_WEBHOOK_SECRET` in your app.

Each hook subscribes to **one event**. To handle multiple events, create one
hook per event (they can all point at the same `address`).

## Managing Hooks

| Action | Request |
|--------|---------|
| List hooks | `GET /api/v1/hooks` |
| Get a hook | `GET /api/v1/hooks/{id}` |
| **Deactivate** a hook | `DELETE /api/v1/hooks/{id}` — this **deactivates** (does not permanently delete) |
| **Reactivate** a hook | `POST /api/v1/hooks/{id}/reactivate` |

A hook is **automatically deactivated after 5 complete failures within 24
hours**. Use the reactivate endpoint to bring it back once your endpoint is
healthy again.

## Delivery Requirements

- Respond with `200`, `201`, or `202` within **10 seconds**.
- Failed deliveries are retried **15 times over ~17 hours**.
- Do heavy work asynchronously (queue it) and acknowledge quickly.

## Rate Limits

The Picqer API is normally limited to **500 requests/minute** (the limit is
dynamic). Exceeding it returns HTTP `429` with Picqer error code `28`. This
applies to your API calls (creating/listing hooks), not to inbound webhook
deliveries.

## Testing Locally

Use the Hookdeck CLI to receive webhooks on your machine (no account required):

```bash
npx hookdeck-cli listen 3000 picqer --path /webhooks/picqer
```

Set the resulting public URL as the hook `address` when you create the hook.

## Full Documentation

See the [Picqer webhooks documentation](https://picqer.com/en/api/webhooks).
