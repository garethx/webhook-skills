# Setting Up BigCommerce Webhooks

BigCommerce webhooks are created and managed through the **API only** — there is
no store dashboard UI for them. You create hooks with an OAuth access token and
verify their callbacks with your app's client secret.

## Prerequisites

- A BigCommerce store
- An **API account** or a registered **app** in the
  [Developer Portal](https://devtools.bigcommerce.com/), which gives you:
  - A **store hash** (`{store_hash}`)
  - An **access token** (`X-Auth-Token`) with the appropriate OAuth scopes
  - A **client secret** — used to verify webhook signatures

## Get Your Client Secret

The client secret is the signing key for webhook verification (via the Standard
Webhooks spec). Find it in the Developer Portal under your app's **API
credentials** (alongside the client id). Keep it secret and load it from an
environment variable — never commit it.

> **Note:** BigCommerce's docs don't clarify whether signatures are sent for
> hooks created with plain store API accounts or only for app-created hooks.
> If your deliveries arrive unsigned, use the custom-headers option below as
> the verification mechanism.

## Create a Webhook (REST API v3)

```bash
curl -X POST https://api.bigcommerce.com/stores/{store_hash}/v3/hooks \
  -H "X-Auth-Token: {access_token}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "scope": "store/order/created",
    "destination": "https://yourapp.com/webhooks/bigcommerce",
    "is_active": true
  }'
```

- `scope` — the event to subscribe to (e.g. `store/order/statusUpdated`). One
  hook per scope; create multiple hooks to subscribe to multiple events.
- `destination` — your HTTPS endpoint on **port 443**.
- `is_active` — set `true` to start receiving deliveries.

### Optional: custom callback headers

You can attach static headers echoed back on every callback for a basic-auth
style check (this is **separate from** signature verification):

```json
{
  "scope": "store/order/created",
  "destination": "https://yourapp.com/webhooks/bigcommerce",
  "is_active": true,
  "headers": { "username": "custom-header-name", "value": "shared-secret" }
}
```

Prefer signature verification (see [verification.md](verification.md)); custom
headers are an optional additional check.

## Other Creation APIs

- **REST v2** — `POST /stores/{store_hash}/v2/hooks` (legacy, similar shape).
- **GraphQL Admin API** — supports advanced **event filters** (`eventFilters`) so
  you receive only deliveries matching conditions you specify.

## List, Update, and Delete Hooks

```bash
# List existing hooks
curl https://api.bigcommerce.com/stores/{store_hash}/v3/hooks \
  -H "X-Auth-Token: {access_token}" -H "Accept: application/json"

# Delete a hook
curl -X DELETE https://api.bigcommerce.com/stores/{store_hash}/v3/hooks/{hook_id} \
  -H "X-Auth-Token: {access_token}"
```

## Activation and Testing

- New hooks can take **up to a minute** to activate before deliveries begin.
- For local testing, tunnel your server with the Hookdeck CLI (no account
  required) and point a hook's `destination` at the tunnel URL:

  ```bash
  npx hookdeck-cli listen 3000 bigcommerce --path /webhooks/bigcommerce
  ```

## Environment Variables

```bash
BIGCOMMERCE_CLIENT_SECRET=your_client_secret   # verify webhook signatures
BIGCOMMERCE_STORE_HASH=abc123                   # call the REST API back
BIGCOMMERCE_ACCESS_TOKEN=your_access_token      # call the REST API back
```
