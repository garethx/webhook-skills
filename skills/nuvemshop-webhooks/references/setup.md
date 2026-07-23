# Setting Up Nuvemshop (Tiendanube) Webhooks

Unlike many platforms, Nuvemshop webhooks are **not** configured in a merchant
dashboard. They are registered programmatically against the REST API, per app.

## Prerequisites

- A Nuvemshop **app** created in the [Partners Portal](https://partners.nuvemshop.com.br/)
  (Tiendanube: [Partners Portal](https://partners.tiendanube.com/)).
- The app's **Client ID** and **Client secret** (from the app settings).
- A store that installed your app, and its **access token** + **store id**
  (obtained via the OAuth flow — the store id is returned as `user_id`).
- A publicly reachable **HTTPS** endpoint (localhost, `tiendanube`, and
  `nuvemshop` domains are rejected).

## Get Your Client Secret

The webhook signature is keyed on your **app's client secret** (the same secret
you use for OAuth token exchange):

1. Go to the Partners Portal → your app.
2. Open the app's settings/credentials.
3. Copy the **Client secret**.
4. Store it as `NUVEMSHOP_CLIENT_SECRET` in your environment — never commit it.

## Register a Webhook

Create one subscription per event with a `POST` to `/webhooks`, authenticated as
the store:

```bash
curl -X POST "https://api.tiendanube.com/v1/{store_id}/webhooks" \
  -H "Authentication: bearer {access_token}" \
  -H "User-Agent: MyApp (contact@example.com)" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "order/paid",
    "url": "https://myapp.com/webhooks/nuvemshop"
  }'
```

Notes:

- The `url` **must be HTTPS** and cannot point to `localhost`, `tiendanube`, or
  `nuvemshop` domains.
- **One subscription per event.** Register a separate webhook for each event you
  want (`order/created`, `order/paid`, …). The same `url` can be reused across
  events — dispatch on the `event` field in the payload.
- List existing webhooks with `GET /webhooks`; remove one with
  `DELETE /webhooks/{id}`.

## Recommended Events

For a typical order-processing integration:

- `order/created`
- `order/paid`
- `order/cancelled`
- `order/fulfilled`
- `product/updated`
- `app/uninstalled` (clean up store data / tokens)

## Testing

There is no dashboard "send test event" button. To test locally:

1. Start a tunnel (see the example READMEs):
   ```bash
   npx hookdeck-cli listen 3000 nuvemshop --path /webhooks/nuvemshop
   ```
2. Register a webhook pointing at the tunnel's HTTPS URL.
3. Trigger the event in a test store (e.g. place/pay an order), or replay a
   captured request from the Hookdeck dashboard.

Signature verification can be tested fully offline — the example test suites
generate real `x-linkedstore-hmac-sha256` signatures with your client secret.
