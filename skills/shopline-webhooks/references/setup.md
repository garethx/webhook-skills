# Setting Up SHOPLINE Webhooks

## Prerequisites

- A SHOPLINE Open Platform (`developer.shopline.com`) developer account and an
  app created in the **Developer Center**
- Your application's webhook endpoint URL (must be publicly reachable HTTPS)
- An Admin API access token for the target store (obtained via the app's OAuth
  install flow)

## Get Your App Secret (signing key)

Webhooks are signed with your **app secret**, not a per-endpoint secret:

1. Go to the **Developer Center** and open your app.
2. Find the **App credentials** section.
3. Copy the **App Secret**. This is the HMAC key used to sign every webhook.

Store it as an environment variable:

```bash
# .env
SHOPLINE_APP_SECRET=your_app_secret_here
```

## Register Your Endpoint (Admin REST API)

Subscribe to a topic by calling the store's Admin REST API. The handle is the
store's subdomain (`{handle}.myshopline.com`) and `{version}` is a dated API
version such as `v20250301`:

```bash
curl -X POST \
  "https://{handle}.myshopline.com/admin/openapi/{version}/webhooks.json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {access_token}" \
  -d '{
    "webhook": {
      "topic": "orders/create",
      "address": "https://your-app.com/webhooks/shopline",
      "api_version": "{version}"
    }
  }'
```

> **`api_version` is required in the create body.** Omitting it returns
> `400 body.webhook:The required property 'api_version' is missing from the object`.
> Deliveries then echo it back in the `X-Shopline-Api-Version` header.

Repeat for each topic you want (`orders/create`, `products/update`,
`collect/delete`, etc.). See
[Subscribe to a Webhook](https://developer.shopline.com/docs/apps/api-instructions-for-use/webhooks/overview/)
in the SHOPLINE docs for the authoritative request/response shape and the
current authentication headers for Admin API calls.

## Test vs Production

- Create a **development/test store** from the Developer Center and install your
  app on it.
- Trigger events (place a test order, edit a product) and confirm your endpoint
  receives and verifies the delivery.
- SHOPLINE expects a **200 within 5 seconds** and retries up to 19 times over
  ~48 hours before removing the subscription — make sure your endpoint stays
  healthy.

## Test Webhooks Locally

Use the Hookdeck CLI to forward public webhooks to your local server (no account
required):

```bash
npx hookdeck-cli listen 3000 shopline --path /webhooks/shopline
```

Use the Hookdeck URL it prints as the `address` when subscribing.

## Full Documentation

- [SHOPLINE Webhooks overview](https://developer.shopline.com/docs/apps/api-instructions-for-use/webhooks/overview/)
- [Generate and verify signatures](https://developer.shopline.com/docs/apps/api-instructions-for-use/generate-and-verify-signatures/)
